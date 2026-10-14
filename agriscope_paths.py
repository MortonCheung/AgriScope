"""Product/runtime are read-only inputs; the independent worker owns mutable state."""
from __future__ import annotations
from dataclasses import dataclass
import os
from pathlib import Path

@dataclass(frozen=True)
class RuntimePaths:
    product: Path
    worker: Path
    runtime: Path


def paths() -> RuntimePaths:
    product = Path(os.environ.get('AGRISCOPE_ROOT') or Path(__file__).resolve().parent).expanduser().resolve()
    first, legacy = os.environ.get('AGRISCOPE_WORKER_ROOT'), os.environ.get('PROJECT_ROOT')
    if first and legacy and Path(first).expanduser().resolve() != Path(legacy).expanduser().resolve():
        raise ValueError('PROJECT_ROOT and AGRISCOPE_WORKER_ROOT must identify the same worker')
    development = product.parent if (product.parent / 'AgriScope').is_dir() and (product.parent / 'data').is_dir() else product.parent / 'agriscope-worker'
    worker = Path(first or legacy or development).expanduser().resolve()
    if worker == product or worker.is_relative_to(product):
        raise ValueError('worker state must be outside the read-only product')
    return RuntimePaths(product, worker, product / 'runtime')
