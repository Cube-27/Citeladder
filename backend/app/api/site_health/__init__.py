"""Site Health API route composition.

The route modules attach their paths to the single shared ``router`` at import
time, so the import order below IS the route-registration order: ``mutations``
before ``pages``. The ``# isort: split`` markers keep ruff from reordering
them; the ``as`` aliases mark intentional re-exports so no blanket ``noqa`` is
needed.
"""

from .common import router as router

# isort: split
from . import mutations as mutations

# isort: split
from . import pages as pages
