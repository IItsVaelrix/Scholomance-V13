package divtube.youtube.analysis;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class YouTubeApiClient {
    private final String apiKey;
    private final HttpClient httpClient;
    private final ObjectMapper mapper;
    private final YouTubeQuotaLedger ledger;

    public YouTubeApiClient(YouTubeQuotaLedger ledger) {
        this.ledger = ledger;
        this.apiKey = System.getenv(YouTubeAnalysisConfig.ENV_API_KEY);
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        this.mapper = new ObjectMapper();
    }

    public boolean hasApiKey() {
        return apiKey != null && !apiKey.trim().isEmpty();
    }

    public JsonNode get(String endpoint, String params, int quotaCost) throws Exception {
        if (!hasApiKey()) throw new RuntimeException("Missing YOUTUBE_API_KEY in environment variables.");
        
        try {
            Thread.sleep(1500);
        } catch (InterruptedException e) {
            // Restore the flag: swallowing it here would let cancel()/shutdown
            // hang forever, since nothing downstream would ever see the interrupt.
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while throttling YouTube API request", e);
        }
        
        String url = YouTubeAnalysisConfig.API_BASE_URL + endpoint + "?key=" + apiKey + "&" + params;
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        ledger.addCost(quotaCost);
        
        if (response.statusCode() != 200) {
            throw new RuntimeException("YouTube API Error: " + response.statusCode() + " - " + response.body());
        }
        
        return mapper.readTree(response.body());
    }
}
