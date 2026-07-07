package divtube.app;

import divtube.ui.MainViewController;
import divtube.download.DownloadRequest;
import java.util.Scanner;

public class DivTubeApp {
    public static void main(String[] args) {
        System.out.println("Starting DivTube Downloader...");
        MainViewController controller = new MainViewController();
        controller.initialize();
        
        Scanner scanner = new Scanner(System.in);
        while (true) {
            System.out.println("\n=== DivTube Menu ===");
            System.out.println("1. Analyze URL");
            System.out.println("2. Download Video");
            System.out.println("3. Run Intelligence Lab (YouTube API)");
            System.out.println("4. Rate Title (Deterministic Math)");
            System.out.println("5. Exit");
            System.out.print("Select an option: ");
            
            if (!scanner.hasNextLine()) break;
            String choice = scanner.nextLine().trim();
            
            if (choice.equals("1")) {
                System.out.print("Enter YouTube URL: ");
                String url = scanner.nextLine().trim();
                controller.onAnalyzeClicked(url);
            } else if (choice.equals("2")) {
                System.out.print("Enter YouTube URL: ");
                String url = scanner.nextLine().trim();
                
                System.out.print("Do you confirm you have rights to download this? (y/n): ");
                boolean confirmed = scanner.nextLine().trim().equalsIgnoreCase("y");
                
                DownloadRequest req = new DownloadRequest(url, "1080p", "mp4", "./downloads", confirmed);
                controller.onDownloadClicked(req);
            } else if (choice.equals("3")) {
                System.out.print("Enter YouTube URL: ");
                String url = scanner.nextLine().trim();
                try {
                    divtube.youtube.analysis.YouTubeAnalysisService intel = new divtube.youtube.analysis.YouTubeAnalysisService();
                    divtube.youtube.analysis.model.VideoAnalysis analysis = intel.analyze(url);
                    String file = divtube.youtube.analysis.AnalysisExportService.exportToJson(analysis);
                    System.out.println("[Intelligence] Analysis complete! Saved to: " + file);
                } catch (Exception e) {
                    System.out.println("[Intelligence Error] " + e.getMessage());
                }
            } else if (choice.equals("4")) {
                System.out.print("Enter Title|Niche|Config: ");
                String input = scanner.nextLine().trim();
                String[] parts = input.split("\\|", 3);
                String title = parts[0].trim();
                String niche = parts.length > 1 ? parts[1].trim() : "General";
                String configJson = parts.length > 2 ? parts[2].trim() : "{}";
                
                try {
                    divtube.youtube.analysis.TitleRatingService rater = new divtube.youtube.analysis.TitleRatingService();
                    String report = rater.rateTitle(title, niche, configJson);
                    System.out.println(report);
                } catch (Exception e) {
                    System.out.println("[Intelligence Error] " + e.getMessage());
                }
            } else if (choice.equals("5") || choice.equalsIgnoreCase("exit") || choice.equalsIgnoreCase("quit")) {
                System.out.println("Exiting...");
                break;
            } else {
                System.out.println("Invalid option, try again.");
            }
        }
        scanner.close();
        System.exit(0);
    }
}
