import asyncio
import json
import math
import os
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
}
PIG_OFFSETS = {
    "green": (-3.0, 0.0),
    "blue": (3.0, 0.0),
    "red": (0.0, -3.0),
    "yellow": (0.0, 4.0),
}


def finite_number(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


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

    async def broadcast(self, room, message):
        await asyncio.gather(
            *(self.send(player["socket"], message) for player in room["players"].values()),
            return_exceptions=True,
        )

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
        team_slots = MODE_TEAMS[mode]
        players = {}
        pigs = {team_id: {"health": 200} for team_id in self.teams_for_mode(mode)}
        room = {
            "id": room_id,
            "mode": mode,
            "players": players,
            "pigs": pigs,
            "blocks": [],
            "winner": None,
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
                "lastMove": time.monotonic(),
                "lastAttack": 0.0,
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
        queue = self.queues[mode]
        player = {
            "id": uuid.uuid4().hex[:12],
            "name": f"Player {self.next_player_number}",
            "socket": socket,
        }
        self.next_player_number += 1
        queue.append(player)
        await self.update_waiting(mode)

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
            victim["health"] = max(0, victim["health"] - 18)
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
            room["pigs"][target_id]["health"] = max(0, room["pigs"][target_id]["health"] - 10)
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
            team_has_alive_players = any(
                player["teamId"] == team_id and player["alive"]
                for player in room["players"].values()
            )
            if room["pigs"][team_id]["health"] > 0 or team_has_alive_players:
                alive_teams.append(team_id)
        if len(alive_teams) == 1:
            room["winner"] = alive_teams[0]

    async def handle_message(self, socket, message):
        connection = self.connections.get(socket)
        if connection is None:
            if message.get("type") != "join" or message.get("mode") not in MODE_TEAMS:
                await self.send(socket, {"type": "error", "message": "Choose a supported match mode to join."})
                return
            await self.join(socket, message["mode"])
            return

        room_id, player_id = connection
        room = self.rooms.get(room_id)
        player = room["players"].get(player_id) if room else None
        if player is None:
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

    async def place_block(self, room, player, message):
        if not player["alive"]:
            return
        position = message.get("position")
        if not isinstance(position, dict):
            return
        if not all(finite_number(position.get(axis)) for axis in ("x", "y", "z")):
            return
        x, y, z = (position[axis] for axis in ("x", "y", "z"))
        if (len(room["blocks"]) >= 500 or
                any(abs(value * 4 - round(value * 4)) > 0.01 for value in (x, y, z)) or
                self.distance(player, {"x": x, "y": y, "z": z}) > 8 or
                y < -4 or y > 24 or abs(x) > 72 or abs(z) > 72):
            return
        if any(math.dist((block["x"], block["y"], block["z"]), (x, y, z)) < 0.3
               for block in room["blocks"]):
            return
        block = {"x": x, "y": y, "z": z, "teamId": player["teamId"]}
        room["blocks"].append(block)
        await self.broadcast(room, {"type": "block_placed", "block": block})

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
            for room in self.rooms.values():
                changed = False
                for player in room["players"].values():
                    if (not player["alive"] and player["respawnAt"] > 0 and
                            now >= player["respawnAt"] and
                            room["pigs"][player["teamId"]]["health"] > 0):
                        x, z = TEAM_SPAWNS[player["teamId"]]
                        player.update(x=x, y=1.65, z=z, health=100, alive=True, respawnAt=0.0)
                        changed = True
                self.update_winner(room)
                if now - room["last_broadcast"] >= 0.05 or changed:
                    room["last_broadcast"] = now
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
