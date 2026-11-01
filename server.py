import asyncio
import json
import math
import os
import random
import time
import uuid
from collections import defaultdict

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Response
from websockets.datastructures import Headers
from websockets.protocol import State


TEAM_SPAWNS = {
    "green": (-42.0, 0.0),
    "blue": (42.0, 0.0),
    "red": (0.0, -42.0),
    "yellow": (0.0, 42.0),
}
MODE_TEAMS = {
    "solo": ["green", "blue"],
    "doubles": ["green", "green", "blue", "blue"],
    "ffa": ["green", "blue", "red", "yellow"],
    "2v2v2v2": ["green", "green", "blue", "blue", "red", "red", "yellow", "yellow"],
    "3v3v3v3": ["green", "green", "green", "blue", "blue", "blue",
                 "red", "red", "red", "yellow", "yellow", "yellow"],
    "4v4v4v4": ["green", "green", "green", "green", "blue", "blue", "blue", "blue",
                 "red", "red", "red", "red", "yellow", "yellow", "yellow", "yellow"],
}
PIG_OFFSETS = {
    "green": (-3.0, 0.0),
    "blue": (3.0, 0.0),
    "red": (0.0, -3.0),
    "yellow": (0.0, 4.0),
}
STARTER_INVENTORY = {
    "iron": 0,
    "gold": 0,
    "emerald": 0,
    "blocks": 48,
    "apples": 1,
    "fireballs": 0,
    "hasBow": False,
    "arrows": 0,
    "pearls": 0,
    "potions": 0,
    "weapon": 10,
    "armor": 0.0,
    "speedBoostUntil": 0.0,
}
SHOP_ITEMS = {
    "blocks": {"cost": {"iron": 4}, "grant": {"blocks": 32}},
    "sword": {"cost": {"iron": 12}, "grant": {"weapon": 22}, "once": "weapon", "max": 22},
    "diamond-sword": {"cost": {"gold": 8}, "grant": {"weapon": 34}, "once": "weapon", "max": 34},
    "apple": {"cost": {"gold": 4}, "grant": {"apples": 1}},
    "armor": {"cost": {"gold": 8}, "grant": {"armor": 0.3}, "once": "armor", "max": 0.0},
}
DISABLED_SHOP_ITEMS = {"fireball", "bow", "arrows", "speed-potion", "pearl"}
PICKUP_LIFETIME = 75.0
ROOM_RESULT_LIFETIME = 30.0
STATE_BROADCAST_INTERVAL = 0.1


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


class MatchServer:
    def __init__(self):
        self.queues = defaultdict(list)
        self.rooms = {}
        self.connections = {}
        self.next_player_number = 1

    async def send(self, socket, message):
        if socket is None or socket.state is not State.OPEN:
            return
        try:
            await socket.send(json.dumps(message, separators=(",", ":")))
        except ConnectionClosed:
            return

    async def send_serialized(self, socket, payload):
        if socket is None or socket.state is not State.OPEN:
            return
        try:
            await socket.send(payload)
        except ConnectionClosed:
            return

    async def broadcast(self, room, message):
        payload = json.dumps(message, separators=(",", ":"))
        await asyncio.gather(
            *(self.send_serialized(player["socket"], payload) for player in room["players"].values()),
            return_exceptions=True,
        )

    def state_broadcast_due(self, room, now):
        if now - room["last_broadcast"] < STATE_BROADCAST_INTERVAL:
            return False
        room["last_broadcast"] = now
        return True

    def public_player(self, player):
        return {
            "id": player["id"],
            "name": player["name"],
            "teamId": player["teamId"],
            "x": player["x"],
            "y": player["y"],
            "z": player["z"],
            "yaw": player["yaw"],
            "health": player["health"],
            "alive": player["alive"],
            "connected": player["connected"],
            "inventory": dict(player["inventory"]),
        }

    def room_state(self, room):
        return {
            "type": "state",
            "roomId": room["id"],
            "players": [self.public_player(player) for player in room["players"].values()],
            "pigs": [
                {"teamId": team_id, "health": pig["health"], "alive": pig["health"] > 0}
                for team_id, pig in room["pigs"].items()
            ],
            "blocks": room["blocks"],
            "pickups": list(room["pickups"].values()),
            "winner": room["winner"],
        }

    def teams_for_mode(self, mode):
        return list(dict.fromkeys(MODE_TEAMS[mode]))

    async def update_waiting(self, mode):
        queue = self.queues[mode]
        message = {
            "type": "waiting",
            "mode": mode,
            "players": len(queue),
            "needed": len(MODE_TEAMS[mode]),
        }
        await asyncio.gather(*(self.send(player["socket"], message) for player in queue))

    async def start_room(self, mode, queued_players):
        room_id = uuid.uuid4().hex[:8]
        now = time.monotonic()
        team_slots = MODE_TEAMS[mode]
        players = {}
        pigs = {team_id: {"health": 200} for team_id in self.teams_for_mode(mode)}
        room = {
            "id": room_id,
            "mode": mode,
            "players": players,
            "pigs": pigs,
            "blocks": [],
            "pickups": {},
            "last_generations": {
                (team_id, resource): now
                for team_id in self.teams_for_mode(mode)
                for resource in ("iron", "gold")
            },
            "last_central_generation": now,
            "winner": None,
            "finished_at": None,
            "last_broadcast": 0.0,
        }
        self.rooms[room_id] = room

        for slot, queued in enumerate(queued_players):
            team_id = team_slots[slot]
            x, z = TEAM_SPAWNS[team_id]
            player = {
                "id": queued["id"],
                "name": queued["name"],
                "teamId": team_id,
                "socket": queued["socket"],
                "connected": True,
                "x": x,
                "y": 1.65,
                "z": z,
                "yaw": math.atan2(-(0.0 - x), -(0.0 - z)),
                "health": 100,
                "alive": True,
                "respawnAt": 0.0,
                "lastMove": now,
                "lastAttack": 0.0,
                "lastUse": 0.0,
                "inventory": dict(STARTER_INVENTORY),
            }
            players[player["id"]] = player
            self.connections[player["socket"]] = (room_id, player["id"])

        for player in players.values():
            await self.send(player["socket"], {
                "type": "match_start",
                "roomId": room_id,
                "mode": mode,
                "playerId": player["id"],
                "teamId": player["teamId"],
                "teams": self.teams_for_mode(mode),
                "state": self.room_state(room),
            })

    async def join(self, socket, mode):
        for queued_mode, queued_players in self.queues.items():
            remaining = [player for player in queued_players if player["socket"].state is State.OPEN]
            if len(remaining) != len(queued_players):
                self.queues[queued_mode][:] = remaining
                if remaining:
                    await self.update_waiting(queued_mode)

        for queued_mode, queued_players in self.queues.items():
            if any(player["socket"] is socket for player in queued_players):
                if queued_mode == mode:
                    await self.update_waiting(queued_mode)
                else:
                    await self.send(socket, {
                        "type": "error",
                        "message": f"This connection is already queued for {queued_mode}.",
                    })
                return

        queue = self.queues[mode]
        player = {
            "id": uuid.uuid4().hex[:12],
            "name": f"Player {self.next_player_number}",
            "socket": socket,
        }
        self.next_player_number += 1
        queue.append(player)

        capacity = len(MODE_TEAMS[mode])
        while len(queue) >= capacity:
            group = queue[:capacity]
            del queue[:capacity]
            await self.start_room(mode, group)
        if queue:
            await self.update_waiting(mode)

    async def leave_waiting(self, socket):
        for mode, queue in self.queues.items():
            remaining = [player for player in queue if player["socket"] is not socket]
            if len(remaining) != len(queue):
                queue[:] = remaining
                await self.update_waiting(mode)
                return

    def distance(self, first, second):
        return math.dist(
            (first["x"], first["y"], first["z"]),
            (second["x"], second["y"], second["z"]),
        )

    def is_facing(self, player, target_x, target_z):
        dx = target_x - player["x"]
        dz = target_z - player["z"]
        distance = math.hypot(dx, dz)
        if distance < 0.001:
            return True
        forward_x = -math.sin(player["yaw"])
        forward_z = -math.cos(player["yaw"])
        return (forward_x * dx + forward_z * dz) / distance >= 0.45

    async def attack(self, room, player, message):
        now = time.monotonic()
        if not player["alive"] or now - player["lastAttack"] < 0.42:
            return
        target = message.get("target")
        if not isinstance(target, dict):
            return
        target_type = target.get("type")
        target_id = target.get("id")
        if not isinstance(target_id, str):
            return await self.reject_action(player["socket"], "invalid_target")

        if target_type == "player":
            victim = room["players"].get(target_id)
            if (victim is None or not victim["alive"] or
                    victim["teamId"] == player["teamId"]):
                return
            if self.distance(player, victim) > 4.25 or abs(player["y"] - victim["y"]) > 2.7:
                return
            if not self.is_facing(player, victim["x"], victim["z"]):
                return
            player["lastAttack"] = now
            inventory = player["inventory"]
            damage = max(1, math.ceil(inventory["weapon"] * (1 - victim["inventory"]["armor"])))
            victim["health"] = max(0, victim["health"] - damage)
            if victim["health"] == 0:
                victim["alive"] = False
                victim["respawnAt"] = now + 5.0 if room["pigs"][victim["teamId"]]["health"] > 0 else 0.0
            await self.broadcast(room, {
                "type": "hit",
                "attackerId": player["id"],
                "attackerPosition": {"x": player["x"], "z": player["z"]},
                "targetType": "player",
                "targetId": victim["id"],
                "health": victim["health"],
            })
        elif target_type == "pig" and target_id in room["pigs"]:
            if target_id == player["teamId"] or room["pigs"][target_id]["health"] <= 0:
                return
            pig_x, pig_z = TEAM_SPAWNS[target_id]
            offset_x, offset_z = PIG_OFFSETS[target_id]
            pig_x += offset_x
            pig_z += offset_z
            pig_target = {"x": pig_x, "y": 0.25, "z": pig_z}
            if (self.distance(player, pig_target) > 4.25 or
                    abs(player["y"] - pig_target["y"]) > 3.0 or
                    not self.is_facing(player, pig_x, pig_z)):
                return
            player["lastAttack"] = now
            damage = max(1, player["inventory"]["weapon"])
            room["pigs"][target_id]["health"] = max(0, room["pigs"][target_id]["health"] - damage)
            await self.broadcast(room, {
                "type": "hit",
                "attackerId": player["id"],
                "attackerPosition": {"x": player["x"], "z": player["z"]},
                "targetType": "pig",
                "targetId": target_id,
                "health": room["pigs"][target_id]["health"],
            })
            self.update_winner(room)

    def update_winner(self, room):
        alive_teams = []
        for team_id in room["pigs"]:
            team_players = [player for player in room["players"].values() if player["teamId"] == team_id]
            team_connected = any(player["connected"] for player in team_players)
            team_has_alive_players = any(player["alive"] and player["connected"] for player in team_players)
            if team_connected and (room["pigs"][team_id]["health"] > 0 or team_has_alive_players):
                alive_teams.append(team_id)
        if len(alive_teams) == 1 and room["winner"] is None:
            room["winner"] = alive_teams[0]
            room["finished_at"] = time.monotonic()
        elif not alive_teams and room["winner"] is None:
            room["winner"] = "draw"
            room["finished_at"] = time.monotonic()

    def reject_action(self, socket, reason):
        return self.send(socket, {"type": "action_rejected", "reason": reason})

    def shop_distance(self, player):
        x, z = TEAM_SPAWNS[player["teamId"]]
        return math.hypot(player["x"] - (x - 5), player["z"] - (z + 5))

    async def buy(self, room, player, message):
        if not player["alive"]:
            return await self.reject_action(player["socket"], "not_alive")
        item_id = message.get("itemId")
        if not isinstance(item_id, str):
            return await self.reject_action(player["socket"], "invalid_item")
        item = SHOP_ITEMS.get(item_id)
        if item is None:
            reason = "unsupported_action" if item_id in DISABLED_SHOP_ITEMS else "invalid_item"
            return await self.reject_action(player["socket"], reason)
        if self.shop_distance(player) > 4:
            return await self.reject_action(player["socket"], "out_of_range")
        inventory = player["inventory"]
        if item.get("once") == "weapon" and inventory["weapon"] >= item["max"]:
            return await self.reject_action(player["socket"], "already_owned")
        if item.get("once") == "armor" and inventory["armor"] != item["max"]:
            return await self.reject_action(player["socket"], "already_owned")
        if not all(inventory.get(resource, 0) >= amount for resource, amount in item["cost"].items()):
            return await self.reject_action(player["socket"], "insufficient_resources")
        for resource, amount in item["cost"].items():
            inventory[resource] -= amount
        for field, amount in item["grant"].items():
            inventory[field] += amount

    async def use_item(self, room, player, message):
        if not player["alive"]:
            return await self.reject_action(player["socket"], "not_alive")
        if message.get("itemId") != "apple":
            return await self.reject_action(player["socket"], "unsupported_action")
        now = time.monotonic()
        inventory = player["inventory"]
        if now - player["lastUse"] < 0.5:
            return await self.reject_action(player["socket"], "cooldown")
        if inventory["apples"] < 1:
            return await self.reject_action(player["socket"], "unavailable")
        if player["health"] >= 100:
            return await self.reject_action(player["socket"], "already_full_health")
        inventory["apples"] -= 1
        player["health"] = min(100, player["health"] + 40)
        player["lastUse"] = now

    async def handle_message(self, socket, message):
        connection = self.connections.get(socket)
        if connection is None:
            mode = message.get("mode")
            if message.get("type") != "join" or not isinstance(mode, str) or mode not in MODE_TEAMS:
                await self.send(socket, {"type": "error", "message": "Choose a supported match mode to join."})
                return
            await self.join(socket, mode)
            return

        room_id, player_id = connection
        room = self.rooms.get(room_id)
        player = room["players"].get(player_id) if room else None
        if player is None:
            return
        if room["winner"] is not None:
            await self.reject_action(socket, "room_finished")
            return

        if message.get("type") == "move":
            if not player["alive"]:
                return
            position = message.get("position")
            yaw = message.get("yaw")
            if (not isinstance(position, dict) or
                    not all(finite_number(position.get(axis)) for axis in ("x", "y", "z")) or
                    not finite_number(yaw)):
                return
            x, y, z = position["x"], position["y"], position["z"]
            if abs(x) > 72 or abs(z) > 72 or y < -30 or y > 100:
                return
            now = time.monotonic()
            elapsed = max(0.05, now - player["lastMove"])
            if math.dist((player["x"], player["z"]), (x, z)) > elapsed * 12 + 1.0:
                return
            player["x"], player["y"], player["z"] = x, y, z
            player["yaw"] = math.atan2(math.sin(yaw), math.cos(yaw))
            player["lastMove"] = now
            if y < -18 and player["alive"]:
                player["health"] = 0
                player["alive"] = False
                player["respawnAt"] = now + 5.0 if room["pigs"][player["teamId"]]["health"] > 0 else 0.0
        elif message.get("type") == "attack":
            await self.attack(room, player, message)
        elif message.get("type") == "block":
            await self.place_block(room, player, message)
        elif message.get("type") == "buy":
            await self.buy(room, player, message)
        elif message.get("type") == "use":
            await self.use_item(room, player, message)

    async def place_block(self, room, player, message):
        if not player["alive"]:
            return await self.reject_action(player["socket"], "not_alive")
        if player["inventory"]["blocks"] < 1:
            return await self.reject_action(player["socket"], "unavailable")
        position = message.get("position")
        if not isinstance(position, dict):
            return await self.reject_action(player["socket"], "invalid_position")
        if not all(finite_number(position.get(axis)) for axis in ("x", "y", "z")):
            return await self.reject_action(player["socket"], "invalid_position")
        x, y, z = (position[axis] for axis in ("x", "y", "z"))
        if (len(room["blocks"]) >= 500 or
                any(abs(value * 4 - round(value * 4)) > 0.01 for value in (x, y, z)) or
                self.distance(player, {"x": x, "y": y, "z": z}) > 8 or
                y < -4 or y > 24 or abs(x) > 72 or abs(z) > 72):
            return await self.reject_action(player["socket"], "invalid_position")
        if any(abs(block["x"] - x) < 0.5 and abs(block["y"] - y) < 0.5 and
               abs(block["z"] - z) < 0.5 for block in room["blocks"]):
            return await self.reject_action(player["socket"], "invalid_position")
        block = {"x": x, "y": y, "z": z, "teamId": player["teamId"]}
        room["blocks"].append(block)
        player["inventory"]["blocks"] -= 1
        await self.broadcast(room, {"type": "block_placed", "block": block})

    def spawn_pickup(self, room, team_id, resource, now):
        cap = 12 if team_id is None else (32 if resource == "iron" else 9)
        if sum(pickup["teamId"] == team_id and pickup["resource"] == resource
               for pickup in room["pickups"].values()) >= cap:
            return
        if team_id is None:
            base_x, base_z, y = 0.0, 0.0, 1.2
        else:
            base_x, base_z = TEAM_SPAWNS[team_id]
            y = 0.55
        pickup_id = uuid.uuid4().hex[:12]
        room["pickups"][pickup_id] = {
            "id": pickup_id,
            "resource": resource,
            "amount": 1,
            "position": {"x": base_x + random.uniform(-0.6, 0.6), "y": y,
                         "z": base_z + random.uniform(-0.6, 0.6)},
            "teamId": team_id,
            "expiresAt": now + PICKUP_LIFETIME,
        }

    def update_pickups(self, room, now):
        changed = False
        for pickup_id, pickup in list(room["pickups"].items()):
            if now >= pickup["expiresAt"]:
                del room["pickups"][pickup_id]
                changed = True
                continue
            position = pickup["position"]
            for player in room["players"].values():
                if not player["alive"] or not player["connected"]:
                    continue
                if self.distance(player, position) < 1.8:
                    player["inventory"][pickup["resource"]] += pickup["amount"]
                    del room["pickups"][pickup_id]
                    changed = True
                    break
        return changed

    def generate_pickups(self, room, now):
        changed = False
        for team_id, pig in room["pigs"].items():
            if pig["health"] <= 0:
                continue
            for resource, interval in (("iron", 2.3), ("gold", 8.0)):
                key = (team_id, resource)
                if now - room["last_generations"][key] >= interval:
                    room["last_generations"][key] = now
                    self.spawn_pickup(room, team_id, resource, now)
                    changed = True
        if now - room["last_central_generation"] >= 6.0:
            room["last_central_generation"] = now
            self.spawn_pickup(room, None, "emerald", now)
            changed = True
        return changed

    async def connection_handler(self, socket):
        try:
            async for raw_message in socket:
                if len(raw_message) > 4096:
                    await socket.close(code=1009, reason="Message too large")
                    break
                try:
                    message = json.loads(raw_message)
                except json.JSONDecodeError:
                    await self.send(socket, {"type": "error", "message": "Invalid message format."})
                    continue
                if not isinstance(message, dict):
                    await self.send(socket, {"type": "error", "message": "Invalid message format."})
                    continue
                await self.handle_message(socket, message)
        except ConnectionClosed:
            pass
        finally:
            await self.leave_waiting(socket)
            connection = self.connections.pop(socket, None)
            if connection:
                room_id, player_id = connection
                room = self.rooms.get(room_id)
                player = room["players"].get(player_id) if room else None
                if player:
                    player["connected"] = False
                    player["alive"] = False
                    player["health"] = 0
                    player["respawnAt"] = 0.0
                    self.update_winner(room)

    async def tick(self):
        while True:
            now = time.monotonic()
            for room_id, room in list(self.rooms.items()):
                if not any(player["connected"] for player in room["players"].values()):
                    room["finished_at"] = room["finished_at"] or now
                if room["finished_at"] is not None and now - room["finished_at"] >= ROOM_RESULT_LIFETIME:
                    for player in room["players"].values():
                        self.connections.pop(player["socket"], None)
                    del self.rooms[room_id]
                    continue
                if room["winner"] is not None or room["finished_at"] is not None:
                    if self.state_broadcast_due(room, now):
                        await self.broadcast(room, self.room_state(room))
                    continue
                self.generate_pickups(room, now)
                self.update_pickups(room, now)
                for player in room["players"].values():
                    if (not player["alive"] and player["respawnAt"] > 0 and
                            now >= player["respawnAt"] and
                            room["pigs"][player["teamId"]]["health"] > 0):
                        x, z = TEAM_SPAWNS[player["teamId"]]
                        player.update(x=x, y=1.65, z=z, health=100, alive=True, respawnAt=0.0)
                self.update_winner(room)
                if self.state_broadcast_due(room, now):
                    await self.broadcast(room, self.room_state(room))
            await asyncio.sleep(0.05)


server_state = MatchServer()


async def health_check(connection, request):
    if request.path == "/healthz":
        return Response(200, "OK", Headers([("Content-Type", "text/plain")]), b"ok")
    return None


async def main():
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8765"))
    origin_setting = os.environ.get("ALLOWED_ORIGINS", "").strip()
    origins = [origin.strip() for origin in origin_setting.split(",") if origin.strip()] or None
    async with serve(
        server_state.connection_handler,
        host,
        port,
        origins=origins,
        process_request=health_check,
        max_size=4096,
        ping_interval=20,
    ):
        print(f"Void Pig Wars multiplayer listening on {host}:{port}", flush=True)
        await server_state.tick()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
