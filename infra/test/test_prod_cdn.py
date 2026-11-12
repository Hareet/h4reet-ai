"""Spec 001 group 8, the edge (tasks.md T104; FR-027 to FR-029, FR-034, FR-061, FR-066; contracts/edge.md;
contracts/aws-alerts.md §5; research.md R-07 to R-09; plan.md §8.1 and §16, "Why a switch"): infra/prod's zone, site
bucket, certificate, and distribution, and the account's probe, read with group 1's standard-library HCL reader, never
with Terraform. (tasks.md names this file test_prod_edge.py; spec 000's protected names hold any infra/ path with
"edge" in it, so the test and its fixtures are named for the CDN instead: plan.md §16, "Group 8, as built".)

What the roots must hold:
  - dns.tf: the public zone hareet.ai, made without the switch, and its name servers as an output, which the Author
    points the registrar at (T115); behind prod's local.wired, the certificate's validation records and the alias
    records, A and AAAA for hareet.ai and www.hareet.ai, to the distribution; no record for a host;
  - site.tf: the site's bucket, which also holds the public view under site/status/, with its public access block, its
    encryption, and its owner's objects, made without the switch; behind it, its bucket policy, which lets
    CloudFront's service read site/* for this distribution alone (aws:SourceArn), and refuses any request without TLS;
  - edge.tf, a file under spec 000's protected names (P-I5): the origin access control, without the switch; behind
    it, the certificate for hareet.ai and www.hareet.ai, validated by DNS, with aws_acm_certificate_validation; the VPC
    origin to the tunnel end, port 8080, HTTP inside AWS's network; and the distribution: its two aliases, the
    certificate by SNI at TLS 1.2 (2021) at least, IPv6, HTTP to HTTPS, no access logs; the origin `site`, the
    bucket under /site through the origin access control, and the origin `relay`, the VPC origin; /api/* to the
    relay with CachingDisabled and the relay's origin-request policy, every other path to the site with its cache
    policy and its response headers; 502 and 504 answered as 503 with /_degraded/api.json, cached for 0 s, and no
    other error mapped, so the relay's 503s pass with their cause;
  - edge-limits.tf (rule T5, P-I5): CloudFront's policies, and only there: the relay's origin-request policy forwards
    exactly CloudFront-Viewer-Address, Content-Type, Accept, and traceparent, with no cookie and no query string; the
    site's response headers are spec 002's CSP, HSTS, Referrer-Policy no-referrer, nosniff, and a Permissions-Policy
    that turns off the camera, the microphone, and geolocation;
  - the account's alerts.tf (P-I5): the probe's schedule enabled behind the account's local.wired, and its alarm,
    h4-probe-failing, behind it too: the probe's errors over 5 minutes, missing data breaching, to h4-alerts on alarm
    and on recovery.

Each check passes with the switches off, as W1 applies them, and on, as P-W2 sets them. Each fixture in
fixtures/prod-cdn/ is one defect, read as test_prod_network.py's fixtures are; a fixture whose "# root: account" line
names the account replaces the account's blocks instead.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
FIXTURES = HERE / "fixtures" / "prod-cdn"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


if not (REPO / "tools" / "gates" / "infra_policy.py").is_file():
    pytest.skip("PLANNED (T010): the reader arrives with P-1", allow_module_level=True)

net = _load("prod_network_for_cdn", HERE / "test_prod_network.py")
ip = net.ip
lit, raw, one, resource, blocks, address, where = (
    net.lit,
    net.raw,
    net.one,
    net.resource,
    net.blocks,
    net.address,
    net.where,
)

WIRED = "local.wired ? 1 : 0"
ALIASES = ["hareet.ai", "www.hareet.ai"]
CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; "
    "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
PERMISSIONS = "microphone=(), camera=(), geolocation=()"
RELAY_HEADERS = {"CloudFront-Viewer-Address", "Content-Type", "Accept", "traceparent"}
# The account names h4-alerts through its data source, as its other alarms do (infra/account/alerts.tf).
TOPIC = "[data.aws_sns_topic.alerts.arn]"
DEGRADED = "/_degraded/api.json"


def prod() -> dict[str, list]:
    return net.parsed(net.root_texts())


def account() -> dict[str, list]:
    return net.parsed(net.account_texts())


def check_zone(r: dict[str, list]) -> list[str]:
    found = []
    zone = one(r, "aws_route53_zone", "site")
    if zone is None or lit(zone, "name") != "hareet.ai" or where(r, zone) != "dns.tf":
        return ["zone: aws_route53_zone.site isn't hareet.ai in dns.tf"]
    if zone.attr("count") is not None or zone.attr("for_each") is not None:
        found.append(
            "zone: the zone waits behind a switch; W1 makes it, so the Author can delegate to it (T115)"
        )
    if zone.block("vpc") is not None:
        found.append("zone: the zone isn't public")
    outputs = [
        o
        for o in blocks(r, "output")
        if raw(o, "value") == "aws_route53_zone.site.name_servers"
    ]
    if len(outputs) != 1:
        found.append(
            "zone: no output gives the zone's name servers, which the Author points the registrar at"
        )
    records = resource(r, "aws_route53_record")
    for rec in records:
        if raw(rec, "zone_id") != "aws_route53_zone.site.zone_id":
            found.append(f"zone: {address(rec)} isn't in the zone")
        if rec.attr("count") is None and rec.attr("for_each") is None:
            found.append(f"zone: {address(rec)} doesn't wait behind the switch")
    aliases = [rec for rec in records if rec.block("alias") is not None]
    pairs = sorted((str(lit(rec, "name")), str(lit(rec, "type"))) for rec in aliases)
    want = sorted((n, t) for n in ALIASES for t in ("A", "AAAA"))
    if pairs != want:
        found.append(
            "zone: the aliases aren't A and AAAA for hareet.ai and www.hareet.ai"
        )
    for rec in aliases:
        alias = rec.block("alias")
        if (
            raw(rec, "count") != WIRED
            or raw(alias, "name") != "aws_cloudfront_distribution.site[0].domain_name"
            or raw(alias, "zone_id")
            != "aws_cloudfront_distribution.site[0].hosted_zone_id"
            or lit(alias, "evaluate_target_health") is not False
        ):
            found.append(
                f"zone: {address(rec)} isn't an alias to the distribution, behind the switch"
            )
    if len(records) != len(aliases) + 1:
        found.append(
            "zone: records beyond the aliases and the certificate's validation (none for a host)"
        )
    return found


def check_certificate(r: dict[str, list]) -> list[str]:
    found = []
    cert = one(r, "aws_acm_certificate", "site")
    if cert is None:
        return ["certificate: aws_acm_certificate.site is missing"]
    if (
        where(r, cert) != "edge.tf"
        or raw(cert, "count") != WIRED
        or lit(cert, "domain_name") != "hareet.ai"
        or lit(cert, "subject_alternative_names") != ["www.hareet.ai"]
        or lit(cert, "validation_method") != "DNS"
    ):
        found.append(
            "certificate: not hareet.ai and www.hareet.ai, validated by DNS, in edge.tf, behind the switch"
        )
    life = cert.block("lifecycle")
    if life is None or lit(life, "create_before_destroy") is not True:
        found.append(
            "certificate: a replaced certificate isn't made before the old one goes"
        )
    validations = [
        rec
        for rec in resource(r, "aws_route53_record")
        if "domain_validation_options" in raw(rec, "for_each")
    ]
    if len(validations) != 1 or not raw(validations[0], "for_each").startswith(
        "local.wired ?"
    ):
        found.append(
            "certificate: its validation records aren't in the zone, behind the switch"
        )
    done = one(r, "aws_acm_certificate_validation", "site")
    if (
        done is None
        or raw(done, "count") != WIRED
        or raw(done, "certificate_arn") != "aws_acm_certificate.site[0].arn"
        or "fqdn" not in raw(done, "validation_record_fqdns")
    ):
        found.append(
            "certificate: aws_acm_certificate_validation doesn't wait for its records, behind the switch"
        )
    return found


def check_vpc_origin(r: dict[str, list]) -> list[str]:
    origin = one(r, "aws_cloudfront_vpc_origin", "relay")
    if origin is None:
        return ["vpc origin: aws_cloudfront_vpc_origin.relay is missing"]
    config = origin.block("vpc_origin_endpoint_config")
    if (
        where(r, origin) != "edge.tf"
        or raw(origin, "count") != WIRED
        or config is None
        or raw(config, "arn") != "aws_instance.tunnel_end.arn"
        or lit(config, "http_port") != 8080
        or lit(config, "origin_protocol_policy") != "http-only"
    ):
        return [
            "vpc origin: not the tunnel end on 8080, HTTP inside AWS's network, in edge.tf, behind the switch"
        ]
    return []


def distribution(r: dict[str, list]):
    return one(r, "aws_cloudfront_distribution", "site")


def check_distribution(r: dict[str, list]) -> list[str]:
    found = []
    d = distribution(r)
    if d is None:
        return ["distribution: aws_cloudfront_distribution.site is missing"]
    if where(r, d) != "edge.tf" or raw(d, "count") != WIRED:
        found.append("distribution: not in edge.tf behind the switch")
    if (
        lit(d, "aliases") != ALIASES
        or lit(d, "enabled") is not True
        or lit(d, "is_ipv6_enabled") is not True
    ):
        found.append(
            "distribution: its aliases aren't hareet.ai and www.hareet.ai, enabled, with IPv6"
        )
    cert = d.block("viewer_certificate")
    if (
        cert is None
        or raw(cert, "acm_certificate_arn")
        != "aws_acm_certificate_validation.site[0].certificate_arn"
        or lit(cert, "ssl_support_method") != "sni-only"
        or lit(cert, "minimum_protocol_version") != "TLSv1.2_2021"
    ):
        found.append(
            "distribution: not the validated certificate by SNI at TLSv1.2_2021 at least"
        )
    if d.block("logging_config") is not None:
        found.append(
            "distribution: access logs would store visitors' addresses (FR-042)"
        )
    origins = {lit(o, "origin_id"): o for o in d.blocks("origin")}
    if set(origins) != {"site", "relay"}:
        found.append("distribution: its origins aren't exactly `site` and `relay`")
    site = origins.get("site")
    if site is not None and (
        raw(site, "domain_name") != "aws_s3_bucket.site.bucket_regional_domain_name"
        or lit(site, "origin_path") != "/site"
        or raw(site, "origin_access_control_id")
        != "aws_cloudfront_origin_access_control.site.id"
        or site.block("s3_origin_config") is not None
    ):
        found.append(
            "distribution: the origin `site` isn't the bucket under /site through origin access control"
        )
    relay = origins.get("relay")
    vpc = relay.block("vpc_origin_config") if relay is not None else None
    if relay is not None and (
        vpc is None
        or raw(vpc, "vpc_origin_id") != "aws_cloudfront_vpc_origin.relay[0].id"
        or relay.block("custom_origin_config") is not None
        or not isinstance(lit(vpc, "origin_read_timeout"), int)
        or lit(vpc, "origin_read_timeout") < 30
    ):
        found.append(
            "distribution: the origin `relay` isn't the VPC origin, read for 30 s at least (the relay's 25)"
        )
    default = d.block("default_cache_behavior")
    if (
        default is None
        or lit(default, "target_origin_id") != "site"
        or lit(default, "viewer_protocol_policy") != "redirect-to-https"
        or lit(default, "allowed_methods") != ["GET", "HEAD"]
        or raw(default, "cache_policy_id") != "aws_cloudfront_cache_policy.site.id"
        or raw(default, "response_headers_policy_id")
        != "aws_cloudfront_response_headers_policy.site.id"
        or default.block("forwarded_values") is not None
    ):
        found.append(
            "distribution: the default isn't the site, HTTPS, GET and HEAD, its cache and headers policies"
        )
    ordered = d.blocks("ordered_cache_behavior")
    api = [b for b in ordered if lit(b, "path_pattern") == "/api/*"]
    if len(ordered) != 1 or len(api) != 1:
        found.append("distribution: the one ordered behavior isn't /api/*")
    else:
        b = api[0]
        if (
            lit(b, "target_origin_id") != "relay"
            or lit(b, "viewer_protocol_policy") != "https-only"
            or "POST" not in (lit(b, "allowed_methods") or [])
            or raw(b, "cache_policy_id")
            != "data.aws_cloudfront_cache_policy.caching_disabled.id"
            or raw(b, "origin_request_policy_id")
            != "aws_cloudfront_origin_request_policy.relay.id"
            or b.attr("response_headers_policy_id") is not None
            or b.block("forwarded_values") is not None
        ):
            found.append(
                "distribution: /api/* isn't the relay over HTTPS, uncached, with the relay's origin-request policy"
            )
    errors = {lit(e, "error_code"): e for e in d.blocks("custom_error_response")}
    if set(errors) != {502, 504}:
        found.append(
            "distribution: the error responses aren't exactly 502 and 504 (the relay's 503s pass through)"
        )
    for code in (502, 504):
        e = errors.get(code)
        if e is not None and (
            lit(e, "response_code") != 503
            or lit(e, "response_page_path") != DEGRADED
            or lit(e, "error_caching_min_ttl") != 0
        ):
            found.append(
                f"distribution: {code} isn't a 503 with {DEGRADED}, cached for 0 s"
            )
    restrictions = d.block("restrictions")
    geo = restrictions.block("geo_restriction") if restrictions is not None else None
    if geo is None or lit(geo, "restriction_type") != "none":
        found.append("distribution: its geo restriction isn't none")
    return found


def check_policies(r: dict[str, list]) -> list[str]:
    found = []
    for b in blocks(r, "resource"):
        if b.labels[0] in ip.EDGE_LIMITS and where(r, b) != "edge-limits.tf":
            found.append(
                f"policies: {address(b)} lives outside edge-limits.tf (rule T5)"
            )
    disabled = one(r, "aws_cloudfront_cache_policy", "caching_disabled", "data")
    if (
        disabled is None
        or lit(disabled, "name") != "Managed-CachingDisabled"
        or where(r, disabled) != "edge-limits.tf"
    ):
        found.append(
            "policies: /api/*'s cache policy isn't CloudFront's managed CachingDisabled, read in edge-limits.tf"
        )
    req = one(r, "aws_cloudfront_origin_request_policy", "relay")
    if req is None:
        found.append("policies: the relay's origin-request policy is missing")
    else:
        headers = req.block("headers_config")
        items = headers.block("headers") if headers is not None else None
        cookies, query = req.block("cookies_config"), req.block("query_strings_config")
        if (
            headers is None
            or lit(headers, "header_behavior") != "whitelist"
            or items is None
            or set(lit(items, "items") or []) != RELAY_HEADERS
            or cookies is None
            or lit(cookies, "cookie_behavior") != "none"
            or query is None
            or lit(query, "query_string_behavior") != "none"
        ):
            found.append(
                "policies: the relay's origin requests don't carry exactly CloudFront-Viewer-Address, Content-Type, "
                "Accept, and traceparent, with no cookie and no query string"
            )
    site = one(r, "aws_cloudfront_cache_policy", "site")
    if site is None:
        found.append("policies: the site's cache policy is missing")
    else:
        params = site.block("parameters_in_cache_key_and_forwarded_to_origin")
        cookies = params.block("cookies_config") if params is not None else None
        if (
            params is None
            or cookies is None
            or lit(cookies, "cookie_behavior") != "none"
            or lit(params, "enable_accept_encoding_gzip") is not True
        ):
            found.append(
                "policies: the site's cache key holds a cookie, or the gzip copies aren't served"
            )
    headers = one(r, "aws_cloudfront_response_headers_policy", "site")
    sec = headers.block("security_headers_config") if headers is not None else None
    if sec is None:
        return [*found, "policies: the site's response headers policy is missing"]
    csp = sec.block("content_security_policy")
    hsts = sec.block("strict_transport_security")
    ref = sec.block("referrer_policy")
    nosniff = sec.block("content_type_options")
    if (
        csp is None
        or lit(csp, "content_security_policy") != CSP
        or lit(csp, "override") is not True
    ):
        found.append(
            "policies: the CSP isn't spec 002's, with connect-src 'self' (SC-010)"
        )
    if (
        hsts is None
        or not isinstance(lit(hsts, "access_control_max_age_sec"), int)
        or lit(hsts, "access_control_max_age_sec") < 31_536_000
        or lit(hsts, "include_subdomains") is not True
    ):
        found.append("policies: HSTS isn't a year at least, with its subdomains")
    if ref is None or lit(ref, "referrer_policy") != "no-referrer":
        found.append("policies: the Referrer-Policy isn't no-referrer")
    if nosniff is None:
        found.append("policies: X-Content-Type-Options isn't nosniff")
    custom = headers.block("custom_headers_config")
    items = {
        lit(i, "header"): i
        for i in (custom.blocks("items") if custom is not None else [])
    }
    perm = items.get("Permissions-Policy")
    if (
        perm is None
        or lit(perm, "value") != PERMISSIONS
        or lit(perm, "override") is not True
    ):
        found.append(
            "policies: the Permissions-Policy doesn't turn off the camera, the microphone, and geolocation"
        )
    if set(items) - {"Permissions-Policy"}:
        found.append(
            "policies: the site's responses carry a custom header beyond the Permissions-Policy"
        )
    return found


def check_bucket(r: dict[str, list]) -> list[str]:
    found = []
    bucket = one(r, "aws_s3_bucket", "site")
    if bucket is None or where(r, bucket) != "site.tf":
        return ["bucket: aws_s3_bucket.site isn't in site.tf"]
    if bucket.attr("count") is not None:
        found.append("bucket: the bucket waits behind a switch; W1 makes it")
    if (
        raw(bucket, "bucket")
        != '"h4reet-ai-site-${data.aws_caller_identity.current.account_id}"'
    ):
        found.append("bucket: its name isn't h4reet-ai-site-<the account's ID>")
    block = [
        b
        for b in resource(r, "aws_s3_bucket_public_access_block")
        if raw(b, "bucket") == "aws_s3_bucket.site.id"
    ]
    if len(block) != 1 or block[0].attr("count") is not None:
        found.append("bucket: its public access block isn't there from W1")
    owner = [
        b
        for b in resource(r, "aws_s3_bucket_ownership_controls")
        if raw(b, "bucket") == "aws_s3_bucket.site.id"
    ]
    rule = owner[0].block("rule") if len(owner) == 1 else None
    if rule is None or lit(rule, "object_ownership") != "BucketOwnerEnforced":
        found.append("bucket: its objects aren't the owner's alone (no ACLs)")
    policies = [
        b
        for b in resource(r, "aws_s3_bucket_policy")
        if raw(b, "bucket") == "aws_s3_bucket.site.id"
    ]
    if len(policies) != 1 or raw(policies[0], "count") != WIRED:
        return [*found, "bucket: its policy doesn't wait behind the switch"]
    doc = one(r, "aws_iam_policy_document", "site", "data")
    statements = net.statements(doc)
    read = [s for s in statements if s["effect"] == "Allow"]
    deny = [s for s in statements if s["effect"] == "Deny"]
    if (
        raw(doc, "count") != WIRED
        or len(read) != 1
        or read[0]["actions"] != {"s3:GetObject"}
        or read[0]["resources"] != '["${aws_s3_bucket.site.arn}/site/*"]'
        or read[0]["principals"] != [("Service", '["cloudfront.amazonaws.com"]')]
        or read[0]["conditions"]
        != [
            (
                "StringEquals",
                "AWS:SourceArn",
                "[aws_cloudfront_distribution.site[0].arn]",
            )
        ]
    ):
        found.append(
            "bucket: its policy doesn't let CloudFront read site/* for this distribution alone"
        )
    if not any(
        ("Bool", "aws:SecureTransport", '["false"]') in s["conditions"] for s in deny
    ):
        found.append("bucket: its policy doesn't refuse a request without TLS")
    return found


def check_oac(r: dict[str, list]) -> list[str]:
    oac = one(r, "aws_cloudfront_origin_access_control", "site")
    if (
        oac is None
        or where(r, oac) != "edge.tf"
        or oac.attr("count") is not None
        or lit(oac, "origin_access_control_origin_type") != "s3"
        or lit(oac, "signing_behavior") != "always"
        or lit(oac, "signing_protocol") != "sigv4"
    ):
        return [
            "oac: the site's origin access control isn't S3's, signing always with SigV4, in edge.tf, from W1"
        ]
    return []


def check_index(r: dict[str, list]) -> list[str]:
    """A folder's path to its index.html, as the web image's nginx serves it: S3 through origin access control has no
    index document, so /disclosure/ and /credits/ would answer 403 without it."""
    fn = one(r, "aws_cloudfront_function", "index")
    code = lit(fn, "code") if fn is not None else None
    found = []
    if (
        fn is None
        or where(r, fn) != "edge.tf"
        or fn.attr("count") is not None
        or lit(fn, "runtime") != "cloudfront-js-2.0"
        or lit(fn, "publish") is not True
        or not isinstance(code, str)
        or 'request.uri.endsWith("/")' not in code
        or 'request.uri += "index.html"' not in code
    ):
        found.append(
            "index: no function in edge.tf, from W1, makes a folder's path its index.html"
        )
    d = distribution(r)
    default = d.block("default_cache_behavior") if d is not None else None
    associations = default.blocks("function_association") if default is not None else []
    if [(lit(a, "event_type"), raw(a, "function_arn")) for a in associations] != [
        ("viewer-request", "aws_cloudfront_function.index.arn")
    ]:
        found.append("index: the site's behavior doesn't run it on each viewer request")
    return found


CHECKS = (
    check_zone,
    check_certificate,
    check_vpc_origin,
    check_distribution,
    check_policies,
    check_bucket,
    check_oac,
    check_index,
)


def problems(r: dict[str, list]) -> list[str]:
    return [p for check in CHECKS for p in check(r)]


def check_probe(a: dict[str, list]) -> list[str]:
    found = []
    rule = next(
        (
            b
            for b in resource(a, "aws_cloudwatch_event_rule")
            if lit(b, "name") == "h4-probe-every-minute"
        ),
        None,
    )
    if rule is None or raw(rule, "state") != 'local.wired ? "ENABLED" : "DISABLED"':
        found.append(
            "probe: its schedule isn't enabled by the account's switch, and disabled without it"
        )
    alarm = next(
        (
            b
            for b in resource(a, "aws_cloudwatch_metric_alarm")
            if lit(b, "alarm_name") == "h4-probe-failing"
        ),
        None,
    )
    if alarm is None:
        return [*found, "probe: its alarm, h4-probe-failing, is missing"]
    if where(a, alarm) != "alerts.tf" or raw(alarm, "count") != WIRED:
        found.append("probe: its alarm isn't in alerts.tf behind the switch")
    if (
        lit(alarm, "namespace") != "AWS/Lambda"
        or lit(alarm, "metric_name") != "Errors"
        or not re.search(r'FunctionName\s*=\s*"h4-probe"', raw(alarm, "dimensions"))
        or lit(alarm, "statistic") != "Sum"
        or lit(alarm, "period") != 60
        or lit(alarm, "evaluation_periods") != 5
        or lit(alarm, "datapoints_to_alarm") != 5
        or lit(alarm, "comparison_operator") != "GreaterThanOrEqualToThreshold"
        or lit(alarm, "threshold") not in (1, 1.0)
    ):
        found.append("probe: its alarm doesn't fire after 5 failed minutes")
    if lit(alarm, "treat_missing_data") != "breaching":
        found.append("probe: its alarm doesn't read a probe that didn't run as failing")
    if raw(alarm, "alarm_actions") != TOPIC or raw(alarm, "ok_actions") != TOPIC:
        found.append("probe: its alarm and its recovery don't go to h4-alerts")
    return found


# ----------------------------------------------------------------------------------------------------------------------
# The tests.


def test_the_root_holds_the_edges_files_with_the_protected_two_from_p_i5_until_applied() -> (
    None
):
    texts = net.root_texts()
    for name in ("dns.tf", "site.tf", "edge.tf", "edge-limits.tf"):
        assert name in texts, name
    for name in ("dns.tf", "site.tf"):
        assert (net.PROD / name).is_file(), name
    for name in ("edge.tf", "edge-limits.tf"):
        assert name in net.PROTECTED_FILES, name


def test_the_zone_and_its_name_servers_without_the_switch() -> None:
    assert check_zone(prod()) == []


def test_the_certificate_validated_by_dns_behind_the_switch() -> None:
    assert check_certificate(prod()) == []


def test_the_vpc_origin_to_the_tunnel_ends_relay() -> None:
    assert check_vpc_origin(prod()) == []


def test_the_distribution_its_origins_behaviors_and_error_responses() -> None:
    assert check_distribution(prod()) == []


def test_cloudfronts_policies_only_in_edge_limits() -> None:
    assert check_policies(prod()) == []


def test_the_bucket_from_w1_and_its_policy_behind_the_switch() -> None:
    assert check_bucket(prod()) == []


def test_the_origin_access_control() -> None:
    assert check_oac(prod()) == []


def test_a_folders_path_is_its_index() -> None:
    assert check_index(prod()) == []


def test_the_probe_enabled_by_the_accounts_switch_with_its_alarm() -> None:
    assert check_probe(account()) == []


def test_the_checks_pass_with_each_switch_off_and_on() -> None:
    # W1's tree holds both off (test_w1_holds_both_switches_off); P-W2 sets both on, and every check holds either way.
    assert problems(prod()) == []
    assert problems(net.switched_on(prod())) == []
    assert (
        check_probe(account()) == [] and check_probe(net.switched_on(account())) == []
    )
    # And the network's own checks, with the edge's files among prod's.
    assert net.problems(prod()) == [] and net.problems(net.switched_on(prod())) == []


def test_no_access_logs_anywhere_in_prod() -> None:
    for b in blocks(prod(), "resource"):
        assert b.labels[0] != "aws_cloudfront_realtime_log_config", address(b)
        assert b.block("logging_config") is None, address(b)


def test_the_disclosure_names_both_origins() -> None:
    text = (REPO / "docs" / "data-flow-disclosure.md").read_text(encoding="utf-8")
    assert "`site`" in text and "`relay`" in text


FIXTURE_FILES = sorted(FIXTURES.glob("*.tf"))


def test_each_fixture_is_one_named_defect() -> None:
    assert len(FIXTURE_FILES) >= 15
    for path in FIXTURE_FILES:
        _, _, _, expect = net.fixture(path)
        assert expect, path.name


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=lambda p: p.stem)
def test_each_fixture_is_caught(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    on_account = re.search(r"^# root: account$", text, re.MULTILINE) is not None
    base = account() if on_account else prod()
    root, expect = net.mutated(base, path)
    found = check_probe(root) if on_account else problems(root) + net.check_files(root)
    for want in expect:
        assert any(want in f for f in found), (want, found)
