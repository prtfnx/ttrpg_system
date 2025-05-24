import asyncio
import logging

logger = logging.getLogger(__name__)

HOST = '127.0.0.1'
PORT = 12345

clients = set()

async def handle_client(reader, writer, queue_to_read, queue_to_write):
    addr = writer.get_extra_info('peername')
    logger.info("Connected by %s", addr)
    clients.add(writer)
    try:
        while True:
            data = await reader.read(4096)
            if not data and queue_to_write.empty():
                break
            if data:
                message = data.decode('utf-8').strip()
                # Handle ping/pong
                if message == "__ping__":
                    writer.write("__pong__".encode())
                    await writer.drain()
                    logger.debug("Received ping, sent pong to %s", addr)
                    continue
                logger.info("Received from %s: %s", addr, message)
                await queue_to_read.put(message)
            elif not queue_to_write.empty():
                # TODO determine client
                out_data = queue_to_write.get_nowait()
                # broadcast to all clients
                for client in clients:
                    client.write(out_data.encode())
                    await client.drain()
    except (asyncio.IncompleteReadError, ConnectionResetError) as e:
        logger.warning("Client %s disconnected: %s", addr, e)
    finally:
        logger.info("Disconnected %s", addr)
        clients.remove(writer)
        writer.close()
        await writer.wait_closed()

async def run_server(queue_to_read, queue_to_write):
    server = await asyncio.start_server(
        lambda r, w: handle_client(r, w, queue_to_read, queue_to_write),
        HOST, PORT
    )
    logger.info("Server listening on %s:%s", HOST, PORT)
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
    logger.info("Server listening on %s:%s", HOST, PORT)
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
    )
    asyncio.run(main())
