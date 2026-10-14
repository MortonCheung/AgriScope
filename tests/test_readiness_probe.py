import io
import pytest
from scripts import check_ready as probe

class Response(io.BytesIO):
    status=200


def test_success_requires_ready_body_and_valid_local_url(monkeypatch):
    monkeypatch.setattr(probe,'urlopen',lambda *_args,**_kw:Response(b'{"status":"ready"}'))
    assert probe.check('http://127.0.0.1:8787/health/ready',1)
    with pytest.raises(ValueError):probe.check('https://example.com/health/ready',1)
    with pytest.raises(ValueError):probe.check('http://127.0.0.1:8787/health/ready',0)


def test_not_ready_and_connection_failure_exhaust_bounded_time(monkeypatch):
    clock=[0]
    monkeypatch.setattr(probe.time,'monotonic',lambda:clock[0])
    monkeypatch.setattr(probe.time,'sleep',lambda seconds:clock.__setitem__(0,clock[0]+seconds))
    monkeypatch.setattr(probe,'urlopen',lambda *_args,**_kw:Response(b'{"status":"not_ready"}'))
    assert not probe.check('http://127.0.0.1:8787/health/ready',2)
    assert clock[0]==2
    clock[0]=0
    monkeypatch.setattr(probe,'urlopen',lambda *_args,**_kw:(_ for _ in ()).throw(OSError('isolated refused connection')))
    assert not probe.check('http://127.0.0.1:8787/health/ready',2)
