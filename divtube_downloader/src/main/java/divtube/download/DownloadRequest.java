package divtube.download;

public class DownloadRequest {
    private final String url;
    private final String quality;
    private final String format;
    private final String saveLocation;
    private final boolean userConfirmedRights;

    public DownloadRequest(String url, String quality, String format, String saveLocation, boolean userConfirmedRights) {
        this.url = url;
        this.quality = quality;
        this.format = format;
        this.saveLocation = saveLocation;
        this.userConfirmedRights = userConfirmedRights;
    }

    public String getUrl() { return url; }
    public String getQuality() { return quality; }
    public String getFormat() { return format; }
    public String getSaveLocation() { return saveLocation; }
    public boolean userConfirmedRights() { return userConfirmedRights; }
}
