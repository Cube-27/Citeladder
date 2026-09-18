"""Parsers for OBSERVED answer surfaces.

Pure modules: no I/O, no session, no clock. A parser turns one provider
payload into the inputs the existing analysis pipeline already consumes, so
a new surface adds a reader rather than a second scoring path.
"""
