"""Actual localhost HTTP responses retain the bytes and exact per-record source."""
from datetime import date
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import parse_qs, urlparse

import pytest

from pipelines.daily.market_feed import config as C, evidence
from pipelines.daily.market_feed.sources import lnfgw_by_city as bc, shenyang_clz as sy


@pytest.fixture
def response_server():
    state = {'revision': 1, 'responses': {}}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def answer(self, key, body):
            state['responses'][key] = body
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == '/sy':
                mt = parse_qs(parsed.query)['marketType'][0]
                rows = [{'productName': f'黄瓜{number}', 'price': state['revision'] + int(mt) / 10,
                         'unit': '元/500g', 'grade': '一级'} for number in range(10 if mt == '1' else 2)]
                body = ('  ' + json.dumps({'data': rows}, ensure_ascii=False) + '\r\n').encode()
                self.answer(('sy', state['revision'], mt), body)
            else:
                form = ('<select name="ctl00$cphMainFrame$ddlCity"><option value="TL">铁岭市</option></select>'
                        '<select name="ctl00$cphMainFrame$ddlPriceBureauType">'
                        '<option value="P">土豆</option><option value="C">黄瓜</option></select>')
                self.answer(('form', state['revision']), form.encode())

        def do_POST(self):
            form = parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode())
            code = form['ctl00$cphMainFrame$ddlPriceBureauType'][0]
            crop = '土豆' if code == 'P' else '黄瓜'
            value = state['revision'] + (1 if code == 'P' else 2) / 10
            body = (f'<!-- original response {code} -->\r\n<table><tr><td>20261005</td><td>蔬菜</td>'
                    f'<td>{crop}</td><td>新鲜一级</td><td>元/500克</td><td>{value}</td></tr></table>').encode()
            self.answer(('bycity', state['revision'], code), body)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}', state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def use_raw_home(tmp_path, monkeypatch):
    monkeypatch.setattr(C, 'HOME', tmp_path)
    monkeypatch.setattr(C, 'RAW_DIR', tmp_path / 'raw')


def assert_receipt(path, expected):
    assert path.read_bytes() == expected
    receipt = json.loads(path.with_name(path.name + '.sha256.json').read_text())
    checksum = hashlib.sha256(expected).hexdigest()
    assert receipt['sha256'] == checksum and receipt['bytes'] == len(expected)
    assert checksum in path.name and receipt['receipt_created_at']


def test_bycity_every_record_points_to_its_actual_post_response(tmp_path, monkeypatch, response_server):
    base, state = response_server
    use_raw_home(tmp_path, monkeypatch)
    monkeypatch.setattr(bc, 'URL', base + '/city')
    first = bc.LnfgwByCity('tieling').collect(date(2026, 10, 15))
    assert first.status == 'SUCCESS' and len(first.records) == 2
    old = {}
    for row in first.records:
        code = 'P' if row.product_raw == '土豆' else 'C'
        path = C.HOME / row.raw_evidence_path
        expected = state['responses']['bycity', 1, code]
        assert_receipt(path, expected)
        assert row.original_price == float(bc._rows(expected.decode())[0][5])
        assert row.observation_date == '2026-10-05'
        old[path] = expected
    assert len({row.raw_evidence_path for row in first.records}) == 2
    state['revision'] = 2
    second = bc.LnfgwByCity('tieling').collect(date(2026, 10, 15))
    assert {row.raw_evidence_path for row in first.records}.isdisjoint({row.raw_evidence_path for row in second.records})
    assert all(path.read_bytes() == expected for path, expected in old.items())


def test_shenyang_price_types_keep_their_own_http_json_bytes(tmp_path, monkeypatch, response_server):
    base, state = response_server
    use_raw_home(tmp_path, monkeypatch)
    monkeypatch.setattr(sy, 'API', base + '/sy')
    result = sy.ShenyangCLZ().collect(date(2026, 10, 15))
    assert result.status == 'SUCCESS' and result.schema_ok and len(result.records) == 14
    by_level = {level: mt for mt, (level, _name) in sy.MARKET_TYPES.items()}
    for row in result.records:
        mt = by_level[row.price_level]
        assert_receipt(C.HOME / row.raw_evidence_path, state['responses']['sy', 1, mt])
        assert row.original_price == 1 + int(mt) / 10
    assert len({row.raw_evidence_path for row in result.records}) == 3


def test_immutable_raw_rejects_corrupted_existing_content(tmp_path, monkeypatch):
    use_raw_home(tmp_path, monkeypatch)
    raw = evidence.save_raw('shenyang', 'source', '2026-10-15', 'response.json', b'raw bytes', immutable=True)
    path = C.HOME / raw
    path.write_bytes(b'tampered')
    with pytest.raises(ValueError, match='Immutable raw response checksum'):
        evidence.save_raw('shenyang', 'source', '2026-10-15', 'response.json', b'raw bytes', immutable=True)
