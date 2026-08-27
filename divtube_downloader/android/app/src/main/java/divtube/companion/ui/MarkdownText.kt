package divtube.companion.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Renders the [parseMarkdown] block model.
 *
 * Kept separate from the parser so the block structure stays unit-testable
 * without an emulator — instrumented tests have never run in this project's
 * environment, so anything that can be a JVM test should be one.
 */
@Composable
fun MarkdownText(source: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        parseMarkdown(source).forEach { block ->
            when (block) {
                is MarkdownBlock.CodeBlock -> CodeBlockView(block)
                is MarkdownBlock.Heading -> Text(
                    block.spans.toAnnotated(),
                    style = when (block.level) {
                        1 -> MaterialTheme.typography.headlineSmall
                        2 -> MaterialTheme.typography.titleLarge
                        else -> MaterialTheme.typography.titleMedium
                    },
                    modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
                )
                is MarkdownBlock.Bullet -> Row(Modifier.padding(vertical = 1.dp)) {
                    Text("•", Modifier.padding(end = 8.dp), style = MaterialTheme.typography.bodyMedium)
                    Text(block.spans.toAnnotated(), style = MaterialTheme.typography.bodyMedium)
                }
                is MarkdownBlock.Paragraph -> Text(
                    block.spans.toAnnotated(),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 2.dp),
                )
            }
        }
    }
}

/**
 * Code scrolls horizontally rather than wrapping: a wrapped line of code on
 * a phone-width screen misrepresents its structure, and indentation is
 * meaning in most of what this agent reads.
 */
@Composable
private fun CodeBlockView(block: MarkdownBlock.CodeBlock) {
    val clipboard = LocalClipboardManager.current
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(6.dp),
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
    ) {
        Column(Modifier.padding(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    block.language ?: "code",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { clipboard.setText(AnnotatedString(block.code)) }) {
                    Text("Copy", style = MaterialTheme.typography.labelSmall)
                }
            }
            Text(
                block.code,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                lineHeight = 17.sp,
                modifier = Modifier.horizontalScroll(rememberScrollState()),
            )
        }
    }
}

@Composable
private fun List<MarkdownSpan>.toAnnotated(): AnnotatedString = buildAnnotatedString {
    this@toAnnotated.forEach { span ->
        when (span) {
            is MarkdownSpan.Text -> append(span.value)
            is MarkdownSpan.Bold -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(span.value) }
            is MarkdownSpan.Code -> withStyle(
                SpanStyle(fontFamily = FontFamily.Monospace, fontSize = 13.sp)
            ) { append(span.value) }
        }
    }
}
