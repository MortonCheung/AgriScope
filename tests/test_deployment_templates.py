"""Deployment roles and same-origin routing must agree before Linux installation."""
import configparser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def unit(name):
    parser = configparser.ConfigParser(interpolation=None, strict=False)
    parser.read(ROOT / name)
    return parser


def test_backend_compatibility_unit_cannot_start_a_different_api():
    canonical = unit('deploy/agriscope-api.service')
    legacy = unit('backend/deploy/agriscope-api.service')
    assert dict(canonical['Service']) == dict(legacy['Service'])
    service = canonical['Service']
    assert service['User'] == 'agriscope'
    assert service['Group'] == 'agriscope'
    assert '--workers 1' in service['ExecStart']
    assert '127.0.0.1' in service['ExecStart'] and '--port 8787' in service['ExecStart']
    assert service['ProtectSystem'] == 'strict'
    assert '/opt/agriscope/runtime' not in service['ReadWritePaths'].split()
    assert 'scripts/verify_assets.py' in service['ExecStartPre']


def test_worker_writes_new_state_and_generation_not_frozen_inputs():
    service = unit('deploy/agriscope-daily-chain.service')['Service']
    writable = service['ReadWritePaths'].split()
    readonly = service['ReadOnlyPaths'].split()
    assert '/srv/agriscope-worker' in writable
    assert '/opt/agriscope/runtime/data/market/publications' in writable
    assert '/opt/agriscope/runtime/data/processed/daily/publications' in writable
    assert '/opt/agriscope/runtime/publication_history' in writable
    assert '/opt/agriscope/runtime/models' in readonly
    assert '/opt/agriscope/runtime/research' in readonly
    assert '/opt/agriscope/runtime/data' in readonly
    assert not any(path in writable for path in readonly)


def test_static_spa_api_and_https_use_one_product_and_finite_timeouts():
    for filename in ['nginx.conf.example', 'nginx.https.conf.example']:
        text = (ROOT / 'deploy' / filename).read_text()
        assert 'root /opt/agriscope/frontend/dist;' in text
        assert 'proxy_pass http://127.0.0.1:8787;' in text
        assert 'proxy_connect_timeout 3s;' in text and 'proxy_read_timeout 60s;' in text
        assert 'try_files $uri $uri/ /index.html;' in text
        assert 'location /assets/' in text and 'try_files $uri =404;' in text
        assert 'location = /index.html' in text and 'Cache-Control "no-cache"' in text
        assert 'proxy_set_header X-Forwarded-Proto $scheme;' in text
    tls = (ROOT / 'deploy/nginx.https.conf.example').read_text()
    assert 'listen 443 ssl;' in tls and 'TLSv1.2 TLSv1.3' in tls
    assert 'ssl_certificate_key /etc/' in tls


def test_environment_does_not_treat_product_as_worker_or_read_legacy_demo_prices():
    text = (ROOT / 'deploy/runtime.env.example').read_text()
    assert 'AGRISCOPE_ROOT=/opt/agriscope' in text
    assert 'PROJECT_ROOT=/srv/agriscope-worker' in text
    assert 'AGRISCOPE_MARKET_POLICY=observed' in text
    assert 'PYTHONPATH=' not in text
