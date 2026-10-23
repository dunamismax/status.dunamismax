#!/usr/bin/env python3
"""uv run --no-project --with aioquic==1.3.0 python http3-probe.py TARGET HOSTNAME"""
import asyncio
import sys
from aioquic.asyncio import connect, QuicConnectionProtocol
from aioquic.h3.connection import H3Connection, H3_ALPN
from aioquic.h3.events import HeadersReceived, DataReceived
from aioquic.quic.configuration import QuicConfiguration
from aioquic.quic.events import ProtocolNegotiated

class Client(QuicConnectionProtocol):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.http = H3Connection(self._quic)
        self.response = asyncio.get_running_loop().create_future()
        self.alpn = None
        self.status = None
    def quic_event_received(self, event):
        if isinstance(event, ProtocolNegotiated):
            self.alpn = event.alpn_protocol
        for item in self.http.handle_event(event):
            if isinstance(item, HeadersReceived):
                self.status = dict(item.headers).get(b':status')
            if isinstance(item, (HeadersReceived, DataReceived)) and item.stream_ended:
                if not self.response.done():
                    self.response.set_result((self.alpn, self.status))
    async def get(self, host):
        stream = self._quic.get_next_available_stream_id()
        self.http.send_headers(stream, [(b':method', b'GET'), (b':scheme', b'https'), (b':authority', host.encode()), (b':path', b'/')], end_stream=True)
        self.transmit()
        return await asyncio.wait_for(self.response, 10)

async def main():
    cfg = QuicConfiguration(is_client=True, alpn_protocols=H3_ALPN, server_name=sys.argv[2])
    async with connect(sys.argv[1], 443, configuration=cfg, create_protocol=Client) as client:
        alpn, status = await client.get(sys.argv[2])
        assert alpn == 'h3' and status == b'200', (alpn, status)
        print('Negotiated ALPN=h3; HTTP status=200; TLS certificate verified')

asyncio.run(asyncio.wait_for(main(), 20))
