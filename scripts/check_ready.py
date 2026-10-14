#!/usr/bin/env python3
"""Bounded local readiness verification after service restart; does not change services."""
from __future__ import annotations
import argparse
import json
import time
from urllib.parse import urlparse
from urllib.request import urlopen


def check(url, timeout=60):
    parsed=urlparse(url)
    if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost','::1') or not 0 < timeout <= 300:
        raise ValueError('bounded loopback readiness probe required')
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        try:
            with urlopen(url,timeout=min(3,max(.1,deadline-time.monotonic()))) as response:
                body=json.loads(response.read(65536))
                if response.status==200 and body.get('status')=='ready':return True
        except (OSError, ValueError, TypeError, AttributeError):pass
        remaining=deadline-time.monotonic()
        if remaining>0:time.sleep(min(1,remaining))
    return False


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:8787/health/ready');parser.add_argument('--timeout',type=float,default=60)
    args=parser.parse_args(argv)
    ready=check(args.url,args.timeout);print('API_READY' if ready else 'API_NOT_READY')
    return 0 if ready else 1

if __name__=='__main__':raise SystemExit(main())
