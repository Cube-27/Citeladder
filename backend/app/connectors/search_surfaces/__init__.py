"""Connectors for OBSERVED answer surfaces.

An answer engine is ASKED a question and answers it. A search surface is
observed: CiteLadder reads a block out of a search result page it did not
author and could not have prompted. The two need different request contracts,
different adapter protocols and different execution shapes, so they live in
different packages rather than sharing one that fits neither.
"""
