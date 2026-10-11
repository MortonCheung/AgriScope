"""Pin one immutable publication per request/startup. Legacy runtime packages stay readable."""
from contextlib import contextmanager
from contextvars import ContextVar
import json
from agriscope_daily_publication import resolve
from . import config as C
from .errors import ApiError, ErrorCode
_REQUEST = ContextVar('agriscope_daily_generation', default=None)


def current():
    value = _REQUEST.get()
    if value is not None:
        return value
    try:
        return resolve(C.RUNTIME_DIR) or {}
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise ApiError(503, ErrorCode.DAILY_UNAVAILABLE, '运行时发布清单无法通过完整性校验。') from exc


@contextmanager
def pin():
    token = _REQUEST.set(current())
    try:
        yield
    finally:
        _REQUEST.reset(token)


def path(kind):
    value = current()
    names = {'daily': 'daily/latest.json', 'monitor': 'daily/monitor.json', 'long': 'long_horizon/latest.json',
             'extended': 'extended_snapshot', 'fingerprint': 'extended_snapshot/.source_fingerprint.json'}
    fallback = {'daily': C.DAILY_LATEST, 'monitor': C.DAILY_MONITOR, 'long': C.LH_LATEST,
                'extended': C.EXTENDED_SNAPSHOT_DIR, 'fingerprint': C.EXTENDED_FINGERPRINT}
    name = names[kind]
    if value and (kind == 'extended' or name in value['files']):
        return value['directory'] / name
    return fallback[kind]


def metadata(snapshot, monitor):
    entry = current()
    try:
        manifest = json.loads((C.RUNTIME_DIR / 'manifest.json').read_text(encoding='utf-8'))
        report = json.loads(C.FINAL_RUN_META.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        manifest, report = {}, {}
    state = monitor or {}
    # last_success_at can mean SKIPPED/0 new records. It is not a verified collection timestamp.
    return dict(collection_attempt_at=state.get('last_attempt_at'), collection_status=state.get('crawl_status'),
                collected_at=state.get('last_collection_completed_at'), observation_date=snapshot.get('latest_data_date'),
                snapshot_generated_at=snapshot.get('generated_at'), runtime_published_at=entry.get('published_at') or manifest.get('generated_at'),
                model_report_generated_at=report.get('generated_at'), model_training_completed_at=None)
