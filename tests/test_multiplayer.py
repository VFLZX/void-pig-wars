import asyncio
import json
import time
import unittest
from unittest.mock import patch

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.protocol import State

from server import MatchServer


class QueueTestSocket:
    def __init__(self):
        self.state = State.OPEN
        self.messages = []

    async def send(self, message):
        self.messages.append(message)


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

    async def test_room_snapshots_are_serialized_once_for_all_players(self):
        first = QueueTestSocket()
        second = QueueTestSocket()
        room = {"players": {"first": {"socket": first}, "second": {"socket": second}}}
        original_dumps = json.dumps

        with patch("server.json.dumps", wraps=original_dumps) as dumps:
            await self.app.broadcast(room, {"type": "state", "players": []})

        self.assertEqual(dumps.call_count, 1)
        self.assertEqual(first.messages, second.messages)

    async def test_room_snapshot_interval_uses_fixed_ten_hz_limit(self):
        room = {"last_broadcast": 10.0}

        self.assertFalse(self.app.state_broadcast_due(room, 10.05))
        self.assertTrue(self.app.state_broadcast_due(room, 10.101))
        self.assertEqual(room["last_broadcast"], 10.101)
        self.assertFalse(self.app.state_broadcast_due(room, 10.151))

    async def test_room_snapshots_are_not_sent_more_than_ten_times_per_second(self):
        first = await self.client("solo")
        await self.receive_type(first, "waiting")
        second = await self.client("solo")
        await asyncio.gather(self.receive_type(first, "match_start"), self.receive_type(second, "match_start"))

        received_at = []
        for _ in range(3):
            await self.receive_type(first, "state")
            received_at.append(time.monotonic())

        self.assertGreaterEqual(min(b - a for a, b in zip(received_at, received_at[1:])), 0.075)

    async def test_rejoining_same_queue_does_not_consume_another_slot(self):
        first = await self.client("solo")
        initial_wait = await self.receive_type(first, "waiting")
        self.assertEqual(initial_wait["players"], 1)

        await first.send(json.dumps({"type": "join", "mode": "solo"}))
        duplicate_wait = await self.receive_type(first, "waiting")
        self.assertEqual(duplicate_wait["players"], 1)

        second = await self.client("solo")
        starts = await asyncio.gather(
            self.receive_type(first, "match_start"),
            self.receive_type(second, "match_start"),
        )
        self.assertEqual(len({start["playerId"] for start in starts}), 2)
        self.assertEqual(len({start["roomId"] for start in starts}), 1)

    async def test_waiting_socket_cannot_switch_match_modes(self):
        socket = await self.client("solo")
        await self.receive_type(socket, "waiting")

        await socket.send(json.dumps({"type": "join", "mode": "ffa"}))
        response = json.loads(await asyncio.wait_for(socket.recv(), timeout=2))

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["message"], "This connection is already queued for solo.")
        self.assertEqual(len(self.app.queues["solo"]), 1)
        self.assertEqual(len(self.app.queues["ffa"]), 0)

    async def test_rejoining_queue_prunes_disconnected_players_first(self):
        first = QueueTestSocket()
        stale = QueueTestSocket()
        await self.app.handle_message(first, {"type": "join", "mode": "doubles"})
        await self.app.handle_message(stale, {"type": "join", "mode": "doubles"})
        stale.state = State.CLOSED

        await self.app.handle_message(first, {"type": "join", "mode": "doubles"})

        waiting = json.loads(first.messages[-1])
        self.assertEqual(waiting["type"], "waiting")
        self.assertEqual(waiting["players"], 1)
        self.assertEqual([player["socket"] for player in self.app.queues["doubles"]], [first])

    async def test_disconnect_from_queue_frees_a_matchmaking_slot(self):
        abandoned = await self.client("solo")
        await self.receive_type(abandoned, "waiting")
        await abandoned.close()
        await asyncio.sleep(0.05)
        self.assertEqual(len(self.app.queues["solo"]), 0)

        first = await self.client("solo")
        self.assertEqual((await self.receive_type(first, "waiting"))["players"], 1)
        second = await self.client("solo")
        starts = await asyncio.gather(
            self.receive_type(first, "match_start"),
            self.receive_type(second, "match_start"),
        )
        self.assertEqual(len({start["playerId"] for start in starts}), 2)

    async def test_ffa_waits_for_four_players_and_assigns_each_team_once(self):
        clients = [await self.client("ffa") for _ in range(3)]
        waiting = [await self.receive_type(client, "waiting") for client in clients]
        self.assertEqual([message["players"] for message in waiting], [1, 2, 3])

        fourth = await self.client("ffa")
        clients.append(fourth)
        starts = await asyncio.gather(*(self.receive_type(client, "match_start") for client in clients))

        self.assertEqual(len({start["roomId"] for start in starts}), 1)
        self.assertEqual(
            {team: sum(start["teamId"] == team for start in starts) for team in ("green", "blue", "red", "yellow")},
            {"green": 1, "blue": 1, "red": 1, "yellow": 1},
        )

    async def test_large_team_modes_fill_capacity_and_balance_four_teams(self):
        for mode, players_per_team in (("2v2v2v2", 2), ("3v3v3v3", 3), ("4v4v4v4", 4)):
            with self.subTest(mode=mode):
                capacity = players_per_team * 4
                app = MatchServer()
                clients = [QueueTestSocket() for _ in range(capacity)]
                for player_count, client in enumerate(clients[:-1], start=1):
                    await app.handle_message(client, {"type": "join", "mode": mode})
                    waiting = json.loads(client.messages[-1])
                    self.assertEqual((waiting["players"], waiting["needed"]), (player_count, capacity))
                await app.handle_message(clients[-1], {"type": "join", "mode": mode})
                starts = [
                    next(json.loads(message) for message in reversed(client.messages)
                         if json.loads(message)["type"] == "match_start")
                    for client in clients
                ]
                self.assertEqual(len({start["roomId"] for start in starts}), 1)
                self.assertEqual(
                    {team: sum(start["teamId"] == team for start in starts)
                     for team in ("green", "blue", "red", "yellow")},
                    {team: players_per_team for team in ("green", "blue", "red", "yellow")},
                )

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
        self.assertEqual(hit["health"], 90)
        self.assertEqual(victim["health"], 90)

    async def test_shop_purchase_reaches_other_players_in_a_room_snapshot(self):
        first = await self.client("solo")
        second = await self.client("solo")
        first_start, second_start = await asyncio.gather(
            self.receive_type(first, "match_start"),
            self.receive_type(second, "match_start"),
        )
        room = self.app.rooms[first_start["roomId"]]
        buyer = room["players"][first_start["playerId"]]
        spawn_x, spawn_z = (-42.0, 0.0) if buyer["teamId"] == "green" else (42.0, 0.0)
        buyer.update(x=spawn_x - 5, z=spawn_z + 5)
        buyer["inventory"]["iron"] = 4

        await self.app.buy(room, buyer, {"itemId": "blocks"})
        replicated_buyer = None
        for _ in range(3):
            snapshot = await asyncio.wait_for(self.receive_type(second, "state"), timeout=0.25)
            replicated_buyer = next(player for player in snapshot["players"] if player["id"] == buyer["id"])
            if replicated_buyer["inventory"]["blocks"] == 80:
                break

        self.assertIsNotNone(replicated_buyer)
        self.assertEqual(replicated_buyer["inventory"]["blocks"], 80)
        self.assertEqual(replicated_buyer["inventory"]["iron"], 0)

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
