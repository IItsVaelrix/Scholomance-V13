package divtube.companion.ui

/**
 * A deliberately small Markdown subset parser for agent replies.
 *
 * No third-party dependency: this module pins every version it uses in
 * `libs.versions.toml`, and a full CommonMark implementation would be a
 * large supply-chain addition to render the handful of constructs a coding
 * agent actually emits. What matters for reading code answers on a phone is
 * fenced code blocks, inline code, headings, bullets and emphasis — so that
 * is exactly what this covers, and unknown syntax degrades to plain text
 * rather than being swallowed.
 *
 * Parsing is separated from rendering (this file has no Compose imports) so
 * the block structure can be unit-tested on the JVM without an emulator —
 * the one kind of test that actually runs in this project's CI today.
 */

sealed interface MarkdownBlock {
    data class Paragraph(val spans: List<MarkdownSpan>) : MarkdownBlock
    data class Heading(val level: Int, val spans: List<MarkdownSpan>) : MarkdownBlock
    data class Bullet(val spans: List<MarkdownSpan>) : MarkdownBlock
    /** `language` is informational only — no highlighting is claimed. */
    data class CodeBlock(val language: String?, val code: String) : MarkdownBlock
}

sealed interface MarkdownSpan {
    data class Text(val value: String) : MarkdownSpan
    data class Bold(val value: String) : MarkdownSpan
    data class Code(val value: String) : MarkdownSpan
}

private val FENCE = Regex("^\\s*```\\s*([A-Za-z0-9_+-]*)\\s*$")
private val HEADING = Regex("^(#{1,6})\\s+(.*)$")
private val BULLET = Regex("^\\s*[-*+]\\s+(.*)$")

/**
 * Split [source] into blocks.
 *
 * An unterminated fence keeps its content as a code block rather than
 * discarding it — a reply truncated mid-block is exactly when the user most
 * wants to see what arrived.
 */
fun parseMarkdown(source: String): List<MarkdownBlock> {
    val blocks = mutableListOf<MarkdownBlock>()
    val paragraph = mutableListOf<String>()

    fun flushParagraph() {
        if (paragraph.isNotEmpty()) {
            blocks += MarkdownBlock.Paragraph(parseInline(paragraph.joinToString(" ").trim()))
            paragraph.clear()
        }
    }

    val lines = source.replace("\r\n", "\n").split("\n")
    var index = 0
    while (index < lines.size) {
        val line = lines[index]
        val fence = FENCE.matchEntire(line)
        if (fence != null) {
            flushParagraph()
            val language = fence.groupValues[1].takeIf { it.isNotBlank() }
            val code = mutableListOf<String>()
            index += 1
            while (index < lines.size && FENCE.matchEntire(lines[index]) == null) {
                code += lines[index]
                index += 1
            }
            index += 1 // consume the closing fence when present
            blocks += MarkdownBlock.CodeBlock(language, code.joinToString("\n"))
            continue
        }

        val heading = HEADING.matchEntire(line)
        if (heading != null) {
            flushParagraph()
            blocks += MarkdownBlock.Heading(heading.groupValues[1].length, parseInline(heading.groupValues[2]))
            index += 1
            continue
        }

        val bullet = BULLET.matchEntire(line)
        if (bullet != null) {
            flushParagraph()
            blocks += MarkdownBlock.Bullet(parseInline(bullet.groupValues[1]))
            index += 1
            continue
        }

        if (line.isBlank()) flushParagraph() else paragraph += line
        index += 1
    }
    flushParagraph()
    return blocks
}

/**
 * Inline spans: `code` first, then **bold**.
 *
 * Backticks are resolved before emphasis on purpose — asterisks inside a
 * code span are literal, and a coding agent emits `*args` and `**kwargs`
 * often enough that treating them as emphasis would visibly mangle output.
 */
fun parseInline(source: String): List<MarkdownSpan> {
    val spans = mutableListOf<MarkdownSpan>()
    var rest = source
    while (rest.isNotEmpty()) {
        val code = Regex("`([^`]+)`").find(rest)
        val bold = Regex("\\*\\*([^*]+)\\*\\*").find(rest)
        val first = listOfNotNull(code, bold).minByOrNull { it.range.first }
        if (first == null) {
            spans += MarkdownSpan.Text(rest)
            break
        }
        if (first.range.first > 0) spans += MarkdownSpan.Text(rest.substring(0, first.range.first))
        spans += if (first === code) MarkdownSpan.Code(first.groupValues[1])
                 else MarkdownSpan.Bold(first.groupValues[1])
        rest = rest.substring(first.range.last + 1)
    }
    return spans.filterNot { it is MarkdownSpan.Text && it.value.isEmpty() }
}
