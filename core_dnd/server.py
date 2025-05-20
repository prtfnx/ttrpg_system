import asyncio
import json

HOST = '127.0.0.1'
PORT = 65432

clients = set()

async def handle_client(reader, writer):
    addr = writer.get_extra_info('peername')
    print(f"Connected by {addr}")
    clients.add(writer)
    try:
        while True:
            data = await reader.read(4096)
            if not data:
                break
            message = data.decode('utf-8')
            print(f"Received from {addr}: {message}")
            # Broadcast to all other clients
            for client in clients:
                if client != writer:
                    client.write(data)
                    await client.drain()
    except (asyncio.IncompleteReadError, ConnectionResetError):
        pass
    finally:
        print(f"Disconnected {addr}")
        clients.remove(writer)
        writer.close()
        await writer.wait_closed()

async def main():
    server = await asyncio.start_server(handle_client, HOST, PORT)
    print(f"Server listening on {HOST}:{PORT}")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    asyncio.run(main())
