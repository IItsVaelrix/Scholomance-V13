package divtube.download;

public final class LegalPolicyGuard {
    public PolicyDecision validate(DownloadRequest request) {
        if (!request.userConfirmedRights()) {
            return PolicyDecision.blocked("Please confirm you have the right to download this content.");
        }

        return PolicyDecision.allowed();
    }
}
