import os
import json
import logging

logger = logging.getLogger(__name__)


def write_sections(scores, flags, references):
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if api_key:
        return _write_with_claude(scores, flags, references, api_key)
    return _write_with_template(scores, flags, references)


def _write_with_template(scores, flags, references):
    sections = {}

    ref_map = {}
    for block in references:
        for code, lang in block.critique_language.items():
            if code not in ref_map:
                ref_map[code] = lang

    worked = []
    if scores.get("thumbnail") is not None and scores["thumbnail"] >= 70:
        worked.append("The thumbnail has strong readability at mobile scale.")
    if scores.get("title", 0) >= 70:
        worked.append("The title is well-constructed with effective hook placement.")
    if scores.get("tag", 0) >= 70:
        worked.append("Tags form a coherent semantic cluster map.")
    if scores.get("performance", 0) >= 70:
        worked.append("Performance metrics indicate healthy engagement.")
    sections["what_worked"] = "\n\n".join(worked) if worked else "No dimensions scored above threshold."

    failed = []
    for flag in flags:
        if flag.severity in ("WARN", "CRIT") and flag.code in ref_map:
            failed.append(f"**{flag.code}**: {ref_map[flag.code]}")
        elif flag.severity in ("WARN", "CRIT"):
            failed.append(f"**{flag.code}**: {flag.message}")
    sections["what_failed"] = "\n\n".join(failed) if failed else "No critical failures detected."

    why = []
    perf_band = scores.get("performance", 0)
    if perf_band is not None and perf_band >= 70:
        why.append("Strong performance suggests the package resonates with its target audience.")
    if scores.get("title", 0) >= 70:
        why.append("Effective title construction likely drives click-through.")
    sections["why_it_worked"] = "\n\n".join(why) if why else "Insufficient performance data to assess causal factors."

    replicate = []
    if scores.get("title", 0) >= 70:
        replicate.append("Maintain the current title structure: hook-first, keyword-frontloaded.")
    if scores.get("tag", 0) >= 70:
        replicate.append("Continue using multi-cluster tag strategy for semantic coverage.")
    sections["replicate"] = "\n\n".join(replicate) if replicate else "Focus on fixing flagged issues before replicating."

    avoid = []
    for flag in flags:
        if flag.code == "TITLE_MOBILE_TRUNCATION":
            avoid.append("Avoid titles over 60 characters; mobile truncation cuts critical information.")
        elif flag.code == "TAG_STUFFING_RISK":
            avoid.append("Avoid near-duplicate tag variants; they signal manipulation to the algorithm.")
        elif flag.code == "THUMBNAIL_LOW_SILHOUETTE":
            avoid.append("Avoid cluttered thumbnails; a single dominant silhouette outperforms noise.")
    sections["avoid"] = "\n\n".join(avoid) if avoid else "No specific anti-patterns detected."

    rewrite = []
    if scores.get("title", 0) is not None and scores["title"] < 60:
        rewrite.append("Consider rewriting the title to front-load a hook within the first 3 words and keep total length under 50 characters.")
    sections["rewrite_suggestions"] = "\n\n".join(rewrite) if rewrite else "Title construction is adequate; no rewrite needed."

    thumb_fix = []
    for flag in flags:
        if flag.code == "THUMBNAIL_LOW_SILHOUETTE":
            thumb_fix.append("Reduce visual clutter; ensure one dominant shape occupies 18-55% of the frame.")
        elif flag.code == "THUMBNAIL_TEXT_COLLAPSE_48PX":
            thumb_fix.append("Remove or enlarge text elements; they must survive 48px downscale.")
        elif flag.code == "THUMBNAIL_LOW_FOREGROUND_CONTRAST":
            thumb_fix.append("Increase foreground-background contrast; use opposing luminance values.")
    sections["thumbnail_fixes"] = "\n\n".join(thumb_fix) if thumb_fix else "Thumbnail readability is acceptable."

    tag_sug = []
    for flag in flags:
        if flag.code == "TAG_CLUSTER_TOO_BROAD":
            tag_sug.append("Add tags covering missing semantic clusters (genre, format, mood, technology, audience-intent).")
        elif flag.code == "TAG_STUFFING_RISK":
            tag_sug.append("Remove near-duplicate tags; replace with semantically distinct long-tail tags.")
    sections["tag_suggestions"] = "\n\n".join(tag_sug) if tag_sug else "Tag coverage is adequate."

    blueprint = []
    blueprint.append("### Prioritized Action Plan")
    blueprint.append("")
    score_areas = [
        ("thumbnail", "Thumbnail Readability"),
        ("title", "Title Construction"),
        ("tag", "Tag Clustering"),
        ("performance", "Performance"),
    ]
    scored = [(k, scores.get(k, 0) or 0, label) for k, label in score_areas]
    scored.sort(key=lambda x: x[1])
    for i, (key, val, label) in enumerate(scored, 1):
        if val < 60:
            blueprint.append(f"{i}. **{label}** (score: {val}) - Priority fix")
        elif val < 80:
            blueprint.append(f"{i}. **{label}** (score: {val}) - Refine")
        else:
            blueprint.append(f"{i}. **{label}** (score: {val}) - Maintain")
    sections["final_blueprint"] = "\n".join(blueprint)

    return sections


def _write_with_claude(scores, flags, references, api_key):
    try:
        import anthropic

        ref_context = []
        for block in references:
            for code in [f.code for f in flags]:
                if code in block.critique_language:
                    ref_context.append({
                        "ref": block.name,
                        "flag": code,
                        "principle": block.principle,
                        "failure_mode": next(
                            (fm for fm in block.failure_modes if code.lower() in fm.lower()), ""
                        ),
                        "critique_language": block.critique_language[code],
                    })

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system="You are a YouTube SEO strategist. Write concise, actionable critique prose for each section. Ground every claim in the provided scores, flags, and reference material. Do not invent metrics or principles not present in the references. Return a JSON object with keys: what_worked, what_failed, why_it_worked, replicate, avoid, rewrite_suggestions, thumbnail_fixes, tag_suggestions, final_blueprint.",
            messages=[{
                "role": "user",
                "content": f"Write the prose sections for this SEO critique report.\n\nScores: {json.dumps(scores)}\nFlags: {json.dumps([f.__dict__ for f in flags])}\n\nReference blocks:\n{json.dumps(ref_context, indent=2)}\n\nReturn a JSON object with these keys: what_worked, what_failed, why_it_worked, replicate, avoid, rewrite_suggestions, thumbnail_fixes, tag_suggestions, final_blueprint. Each value should be a markdown string.",
            }],
        )

        result_text = message.content[0].text
        sections = json.loads(result_text)
        return sections

    except Exception:
        # Falling back to templated prose is the intended degradation, but the
        # bare `except Exception` also hides auth failures, a retired model
        # name, and JSON that will not parse — so the report silently stops
        # being LLM-written and nothing records why. Log at exception level
        # with the stack, then degrade.
        logger.exception(
            "Claude prose failed; falling back to template. scores=%s flags=%d",
            sorted(scores or {}), len(flags or []),
        )
        return _write_with_template(scores, flags, references)
