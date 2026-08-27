package divtube.companion.ui.theme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
private val Colors = darkColorScheme(
    primary = SignalBrass,
    secondary = QuietInk,
    tertiary = VerifiedTeal,
    error = BlockedRose,
    background = NightBus,
    surface = NightBus,
    surfaceVariant = QuietInk,
    onBackground = PaperMist,
    onSurface = PaperMist,
)
@Composable fun DivTubeTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = Colors, typography = DivTubeTypography, content = content)
