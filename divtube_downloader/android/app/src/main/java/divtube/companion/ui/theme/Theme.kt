package divtube.companion.ui.theme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
private val Colors = darkColorScheme(primary = Crimson, secondary = Gold, background = Obsidian, surface = Obsidian, onBackground = Parchment, onSurface = Parchment)
@Composable fun DivTubeTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = Colors, content = content)
