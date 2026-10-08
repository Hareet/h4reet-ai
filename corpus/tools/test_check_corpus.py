"""Tests for the corpus gate's currency rule. Pure logic: no corpus files are read."""

import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "check_corpus", Path(__file__).with_name("check_corpus.py")
)
check_corpus = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_corpus)


@pytest.mark.parametrize(
    "line",
    [
        # Symbols and international codes
        "$50,000",
        "€10k",
        "£5",
        "50,000 USD",
        "5M USD",
        "5bn USD",
        "USD 50,000",
        "EUR 10,000",
        "5 million US dollars",
        "a 5-million-dollar award",
        "a 10,000-dollar prize",
        "10 dollars",
        # Kenya
        "KES 5,000,000",
        "KSh 5m",
        "Ksh 200",
        "KShs 5,000",
        "Ksh. 5,000",
        "KSh. 2,500",
        "Sh5 billion",
        "Shs 300,000",
        "5,000/=",
        "50,000 Kenyan shillings",
        "a 50,000-shilling fee",
        "1.2 million shillings",
        # India
        "₹4,00,000",
        "Rs. 400000",
        "Rs 400",
        "INR 1,000",
        "40 lakh rupees",
        "10 lakh Indian rupees",
        # Nepal
        "NPR 250000",
        "NRs 25,000",
        "₨ 25,000",
        "25,000 Nepali rupees",
        # Uganda, Tanzania and Zanzibar, Mali
        "UGX 5,000",
        "USh 5,000",
        "TZS 10,000",
        "TSh 10,000",
        "XOF 5000",
        "CFA 5000",
    ],
)
def test_flags_currency_amounts(line):
    assert check_corpus.CURRENCY.search(line)


@pytest.mark.parametrize(
    "line",
    [
        "The community delivers care to an estimated 90 million people.",
        "office hours and workshops",
        "a proof of concept in Q2 2026, then Q3 2026",
        "47+ organizations across 24 countries",
        "PRs 3 and 4 were merged",
        "a weight of 5 kg",
        "24/7 support",
        "Shared 3 notes",
        "the SH2 domain",
    ],
)
def test_ignores_numbers_that_are_not_money(line):
    assert not check_corpus.CURRENCY.search(line)


def test_npr_followed_by_a_year_is_flagged_on_purpose():
    # The broadcaster followed by a year looks like an amount in rupees. Rephrasing the sentence is
    # cheaper than missing a real amount, so the rule keeps flagging it.
    assert check_corpus.CURRENCY.search("NPR 2024 coverage")
