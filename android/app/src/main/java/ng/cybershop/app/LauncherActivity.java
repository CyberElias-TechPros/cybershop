package ng.cybershop.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/** Browser-owned cookies, permissions and external handovers; no JavaScript bridge. */
public final class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override protected void onCreate(Bundle savedInstanceState) {
        Uri incoming = getIntent() == null ? null : getIntent().getData();
        String candidate = incoming == null ? null : incoming.toString();
        String safe = LinkPolicy.isAllowed(candidate, BuildConfig.TRUSTED_ORIGIN)
            ? candidate : BuildConfig.TRUSTED_ORIGIN + "/";
        // Drop arbitrary extras, ClipData, components and intent:// forwarding.
        setIntent(new Intent(Intent.ACTION_VIEW, Uri.parse(safe)));
        super.onCreate(savedInstanceState);
    }
    @Override protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();
        return uri != null && LinkPolicy.isAllowed(uri.toString(), BuildConfig.TRUSTED_ORIGIN)
            ? uri : Uri.parse(BuildConfig.TRUSTED_ORIGIN + "/");
    }
}
