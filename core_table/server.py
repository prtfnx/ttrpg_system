import asyncio
import json

HOST = '127.0.0.1'
PORT = 12345

clients = set()

async def handle_client(reader, writer,queue_to_read, queue_to_write):
    addr = writer.get_extra_info('peername')
    print(f"Connected by {addr}")
    clients.add(writer)
    try:
        while True:
            data = await reader.read(4096)
            if not data and queue_to_write.empty():
                break
            if queue_to_write.empty():
                message = data.decode('utf-8')
                print(f"Received from {addr}: {message}")
                queue_to_read.put_nowait(message)
                
            else:
                # TODO determine client
                data = queue_to_write.get_nowait()
                # broadcast to all clients
                for client in clients:                    
                    client.write(data.encode())
                    await client.drain()
    except (asyncio.IncompleteReadError, ConnectionResetError):
        pass
    finally:
        print(f"Disconnected {addr}")
        clients.remove(writer)
        writer.close()
        await writer.wait_closed()
async def run_server(queue_to_read, queue_to_write):
    server = await asyncio.start_server(
        lambda r, w: handle_client(r, w, queue_to_read, queue_to_write),
        HOST, PORT
    )
    print(f"Server listening on {HOST}:{PORT}")
    async with server:
        await server.serve_forever()

async def main():
    queue_to_read = asyncio.Queue()
    queue_to_write = asyncio.Queue()
    # Start the server
    server = await asyncio.start_server(
        lambda r, w: handle_client(r, w, queue_to_read, queue_to_write),
        HOST, PORT
    )
    print(f"Server listening on {HOST}:{PORT}")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    asyncio.run(main())
