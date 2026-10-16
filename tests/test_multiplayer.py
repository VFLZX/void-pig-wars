import asyncio
import json
import time
import unittest

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

from server import MatchServer


class MultiplayerServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = MatchServer()
        self.server = await serve(self.app.connection_handler, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]
        self.tick_task = asyncio.create_task(self.app.tick())
        self.clients = []

    async def asyncTearDown(self):
        for client in self.clients:
            await client.close()
        self.tick_task.cancel()
        try:
            await self.tick_task
        except asyncio.CancelledError:
            pass
        self.server.close()
        await self.server.wait_closed()

    async def client(self, mode):
        socket = await connect(f"ws://127.0.0.1:{self.port}")
        self.clients.append(socket)
        await socket.send(json.dumps({"type": "join", "mode": mode}))
        return socket

    async def receive_type(self, socket, message_type):
        while True:
            message = json.loads(await asyncio.wait_for(socket.recv(), timeout=2))
            if message["type"] == message_type:
                return message

    async def test_solo_clients_share_movement_and_authoritative_combat(self):
        first = await self.client("solo")
        waiting = await self.receive_type(first, "waiting")
        self.assertEqual((waiting["players"], waiting["needed"]), (1, 2))

        second = await self.client("solo")
        first_start, second_start = await asyncio.gather(
            self.receive_type(first, "match_start"),
            self.receive_type(second, "match_start"),
        )
        self.assertEqual(first_start["roomId"], second_start["roomId"])
        self.assertNotEqual(first_start["teamId"], second_start["teamId"])

        room = self.app.rooms[first_start["roomId"]]
        attacker = room["players"][first_start["playerId"]]
        victim = room["players"][second_start["playerId"]]
        attacker.update(x=0.0, y=1.65, z=0.0, yaw=-1.57079632679, lastMove=time.monotonic())
        victim.update(x=2.0, y=1.65, z=0.0)

        await first.send(json.dumps({
            "type": "move",
            "position": {"x": 0.5, "y": 1.65, "z": 0},
            "yaw": -1.57079632679,
        }))
        moved = None
        for _ in range(5):
            state_message = await self.receive_type(second, "state")
            moved = next(player for player in state_message["players"] if player["id"] == attacker["id"])
            if moved["x"] == 0.5:
                break
        self.assertEqual(moved["x"], 0.5)

        await first.send(json.dumps({
            "type": "block",
            "position": {"x": 1.5, "y": -0.25, "z": 0.5},
        }))
        placed = await self.receive_type(second, "block_placed")
        self.assertEqual(placed["block"]["teamId"], attacker["teamId"])

        await first.send(json.dumps({
            "type": "attack",
            "target": {"type": "player", "id": victim["id"]},
        }))
        hit = await self.receive_type(second, "hit")
        self.assertEqual(hit["targetId"], victim["id"])
        self.assertEqual(hit["health"], 82)
        self.assertEqual(victim["health"], 82)

    async def test_pig_hits_are_shared_and_team_scoped(self):
        first = await self.client("solo")
        second = await self.client("solo")
        start_one, start_two = await asyncio.gather(
            self.receive_type(first, "match_start"),
            self.receive_type(second, "match_start"),
        )
        room = self.app.rooms[start_one["roomId"]]
        attacker = room["players"][start_one["playerId"]]
        attacker.update(x=42.0, y=1.65, z=0.0, yaw=-1.57079632679)

        await first.send(json.dumps({
            "type": "attack",
            "target": {"type": "pig", "id": "blue"},
        }))
        hit = await self.receive_type(second, "hit")
        self.assertEqual((hit["targetType"], hit["health"]), ("pig", 190))

        await asyncio.sleep(0.45)
        await first.send(json.dumps({
            "type": "attack",
            "target": {"type": "pig", "id": "green"},
        }))
        with self.assertRaises(asyncio.TimeoutError):
            await asyncio.wait_for(self.receive_type(second, "hit"), timeout=0.15)
        self.assertEqual(room["pigs"]["green"]["health"], 200)

    async def test_doubles_waits_for_four_humans_and_assigns_alliance_slots(self):
        clients = [await self.client("doubles") for _ in range(3)]
        for client in clients:
            waiting = await self.receive_type(client, "waiting")
        self.assertEqual(waiting["players"], 3)

        fourth = await self.client("doubles")
        clients.append(fourth)
        starts = await asyncio.gather(*(self.receive_type(client, "match_start") for client in clients))
        self.assertTrue(all(start["roomId"] == starts[0]["roomId"] for start in starts))
        self.assertEqual(
            {team: sum(start["teamId"] == team for start in starts) for team in ("green", "blue")},
            {"green": 2, "blue": 2},
        )

    async def test_doubles_team_mates_cannot_damage_each_other(self):
        clients = [await self.client("doubles") for _ in range(4)]
        starts = await asyncio.gather(*(self.receive_type(client, "match_start") for client in clients))
        room = self.app.rooms[starts[0]["roomId"]]
        green_slots = [
            (client, room["players"][start["playerId"]])
            for client, start in zip(clients, starts)
            if start["teamId"] == "green"
        ]
        (attacker_socket, attacker), (_, teammate) = green_slots
        attacker.update(x=0.0, y=1.65, z=0.0, yaw=-1.57079632679)
        teammate.update(x=2.0, y=1.65, z=0.0)

        await attacker_socket.send(json.dumps({
            "type": "attack",
            "target": {"type": "player", "id": teammate["id"]},
        }))
        await self.receive_type(clients[0], "state")
        self.assertEqual(teammate["health"], 100)


if __name__ == "__main__":
    unittest.main()
