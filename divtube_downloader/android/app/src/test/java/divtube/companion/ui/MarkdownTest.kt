package divtube.companion.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownTest {
    @Test fun fencedCodeBlockKeepsItsLinesAndLanguage() {
        val blocks = parseMarkdown("before\n```python\ndef f():\n    return 1\n```\nafter")
        val code = blocks.filterIsInstance<MarkdownBlock.CodeBlock>().single()
        assertEquals("python", code.language)
        assertEquals("def f():\n    return 1", code.code)
        assertEquals(2, blocks.filterIsInstance<MarkdownBlock.Paragraph>().size)
    }

    @Test fun codeBlockPreservesIndentationAndBlankLines() {
        // Whitespace IS the content for Python; a renderer that collapses it
        // is worse than useless for reading code.
        val blocks = parseMarkdown("```\nif x:\n\n    y()\n```")
        assertEquals("if x:\n\n    y()", blocks.filterIsInstance<MarkdownBlock.CodeBlock>().single().code)
    }

    @Test fun unterminatedFenceStillYieldsItsContent() {
        // A reply cut off mid-block is exactly when the user most wants to
        // see what did arrive.
        val code = parseMarkdown("```kotlin\nval a = 1").filterIsInstance<MarkdownBlock.CodeBlock>().single()
        assertEquals("val a = 1", code.code)
    }

    @Test fun headingsAndBulletsAreDistinctBlocks() {
        val blocks = parseMarkdown("## Title\n- one\n- two")
        assertEquals(2, (blocks[0] as MarkdownBlock.Heading).level)
        assertEquals(2, blocks.filterIsInstance<MarkdownBlock.Bullet>().size)
    }

    @Test fun inlineCodeWinsOverEmphasisSoPythonArgsSurvive() {
        // `**kwargs` inside backticks must stay literal, not become bold.
        val spans = parseInline("pass `**kwargs` through")
        assertTrue(spans.any { it is MarkdownSpan.Code && it.value == "**kwargs" })
        assertTrue(spans.none { it is MarkdownSpan.Bold })
    }

    @Test fun boldIsParsedOutsideCode() {
        val spans = parseInline("this is **important** here")
        assertEquals("important", spans.filterIsInstance<MarkdownSpan.Bold>().single().value)
    }

    @Test fun plainTextPassesThroughUnchanged() {
        val spans = parseInline("nothing special")
        assertEquals(listOf(MarkdownSpan.Text("nothing special")), spans)
    }

    @Test fun emptyInputProducesNoBlocks() {
        assertEquals(emptyList<MarkdownBlock>(), parseMarkdown(""))
    }
}
