import json
from types import SimpleNamespace
from scripts import run_daily_chain as chain
from pipelines.publishing import publish_daily_runtime
from pipelines.long_horizon import run_long_horizon_job


def test_failed_daily_cannot_publish_or_trigger_long_job(tmp_path,monkeypatch):
    calls=[];writes=[]
    monkeypatch.setattr(chain,'PROJECT',tmp_path)
    monkeypatch.setattr(chain.subprocess,'run',lambda command,**kwargs:(calls.append(command) or SimpleNamespace(returncode=2,stdout='SUMMARY {"crawl_status":"FAILED"}\n')))
    publish=lambda *_args,**_kw:(_ for _ in ()).throw(AssertionError('must not publish'))
    monkeypatch.setattr(publish_daily_runtime,'publish',publish)
    monkeypatch.setattr(run_long_horizon_job,'atomic_json',lambda path,value:writes.append((path,value)))
    assert chain.main([])==2
    assert len(calls)==1 and writes[-1][1]['long_horizon_exit'] is None


def test_failed_long_job_can_publish_daily_without_advancing_long(tmp_path,monkeypatch):
    calls=[];publications=[];writes=[]
    monkeypatch.setattr(chain,'PROJECT',tmp_path)
    summary={'snapshot_status':'partial','crawl_status':'SKIPPED','snapshot_hash':'actual-valid'}
    def run(command,**kwargs):
        calls.append(command)
        return SimpleNamespace(returncode=0,stdout='SUMMARY '+json.dumps(summary)+'\n') if len(calls)==1 else SimpleNamespace(returncode=2)
    monkeypatch.setattr(chain.subprocess,'run',run)
    monkeypatch.setattr(publish_daily_runtime,'publish',lambda project,runtime,include_long_horizon:(publications.append(include_long_horizon) or {'status':'PUBLISHED'}))
    monkeypatch.setattr(run_long_horizon_job,'atomic_json',lambda path,value:writes.append(value))
    assert chain.main([])==5
    assert publications==[False] and writes[-1]['status']=='DAILY_SUCCESS_LONG_HORIZON_FAILED'
    assert calls[0][-1].endswith('run_daily.py') and calls[1][-1].endswith('run_long_horizon_job.py')


def test_publisher_failure_returns_distinct_failure_without_false_success(tmp_path,monkeypatch):
    count=[];writes=[]
    monkeypatch.setattr(chain,'PROJECT',tmp_path)
    summary={'snapshot_status':'complete','crawl_status':'OK','snapshot_hash':'actual-valid'}
    monkeypatch.setattr(chain.subprocess,'run',lambda *args,**kwargs:(count.append(args) or SimpleNamespace(returncode=0,stdout='SUMMARY '+json.dumps(summary)+'\n')))
    monkeypatch.setattr(publish_daily_runtime,'publish',lambda *_args,**_kw:(_ for _ in ()).throw(ValueError('incompatible')))
    monkeypatch.setattr(run_long_horizon_job,'atomic_json',lambda path,value:writes.append(value))
    assert chain.main([])==6 and writes[-1]['status']=='RUNTIME_PUBLICATION_FAILED'


def test_skipped_empty_failed_and_dry_collection_never_get_success_timestamp(monkeypatch):
    from pipelines.daily import run_daily as daily
    monkeypatch.setattr(daily.IO,'now_str',lambda:'actual-completion-time')
    def row(status,count=1,schema_ok=True):return SimpleNamespace(status=status,count=count,schema_ok=schema_ok)
    assert daily.collection_completed_at([row('SKIPPED')]) is None
    assert daily.collection_completed_at([row('FAILED')]) is None
    assert daily.collection_completed_at([row('OK',0)]) is None
    assert daily.collection_completed_at([row('OK',schema_ok=False)]) is None
    assert daily.collection_completed_at([row('OK')],True) is None
    assert daily.collection_completed_at([row('OK')])=='actual-completion-time'
