package ng.cybershop.app;

import java.net.URI;
import java.net.URISyntaxException;

/** No privileged web surface: only the exact configured HTTPS origin may launch. */
public final class LinkPolicy {
    private LinkPolicy() {}
    public static boolean isAllowed(String value, String trustedOrigin) {
        if (value == null || value.length() > 8192) return false;
        try {
            URI uri = new URI(value);
            URI origin = new URI(trustedOrigin);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                && uri.getHost().equalsIgnoreCase(origin.getHost())
                && uri.getRawUserInfo() == null && uri.getRawFragment() == null
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && !uri.isOpaque();
        } catch (URISyntaxException | IllegalArgumentException error) {
            return false;
        }
    }
}
