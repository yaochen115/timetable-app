package com.linmu.timetable;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.AtomicFile;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://linmu.local/";
    private static final int SELECT_FILE = 40;
    private static final int MAX_STATE_BYTES = 4 * 1024 * 1024;
    private WebView webView;
    private FrameLayout root;
    private ValueCallback<Uri[]> fileCallback;
    private AtomicFile stateFile;
    private String appearance = "system";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        stateFile = new AtomicFile(new File(getFilesDir(), "schedules-v1.json"));
        root = new FrameLayout(this);
        setContentView(root);
        try {
            webView = new WebView(this);
        } catch (RuntimeException error) {
            TextView message = new TextView(this);
            message.setText("请安装或更新 Android System WebView 后重新打开林木");
            message.setPadding(32, 80, 32, 32);
            root.addView(message);
            return;
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        if (Build.VERSION.SDK_INT >= 33) settings.setAlgorithmicDarkeningAllowed(false);
        webView.addJavascriptInterface(new NativeBridge(), "LinmuNative");
        webView.setWebViewClient(new LocalClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try { startActivityForResult(intent, SELECT_FILE); }
                catch (RuntimeException error) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
        } else root.setFitsSystemWindows(true);
        updateAppearance();
        webView.loadUrl(ORIGIN + "index.html");
    }

    private final class LocalClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !request.getUrl().toString().startsWith(ORIGIN);
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equals(uri.getScheme()) || !"linmu.local".equals(uri.getHost())) return emptyResponse();
            String name = uri.getPath();
            if (name == null) return emptyResponse();
            if (name.equals("/")) name = "/index.html";
            String mime;
            switch (name) {
                case "/index.html": mime = "text/html"; break;
                case "/app.js": mime = "text/javascript"; break;
                case "/styles.css": mime = "text/css"; break;
                case "/icon.svg": mime = "image/svg+xml"; break;
                default: return emptyResponse();
            }
            try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(name.substring(1))); }
            catch (Exception error) { Log.e("Linmu", "Missing packaged asset: " + name, error); return emptyResponse(); }
        }
    }

    private WebResourceResponse emptyResponse() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
    }

    public final class NativeBridge {
        @JavascriptInterface public synchronized String readState() {
            if (!stateFile.getBaseFile().exists() && !new File(stateFile.getBaseFile() + ".bak").exists()) return "";
            try { return new String(stateFile.readFully(), StandardCharsets.UTF_8); }
            catch (Exception error) { Log.e("Linmu", "Cannot read state", error); return ""; }
        }

        @JavascriptInterface public synchronized boolean writeState(String text) {
            FileOutputStream stream = null;
            try {
                byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > MAX_STATE_BYTES) return false;
                JSONObject state = new JSONObject(text);
                if (state.getInt("version") != 1 || state.getJSONArray("terms").length() == 0) return false;
                stream = stateFile.startWrite();
                stream.write(bytes);
                stateFile.finishWrite(stream);
                return true;
            } catch (Exception error) {
                if (stream != null) stateFile.failWrite(stream);
                Log.e("Linmu", "Cannot save state", error);
                return false;
            }
        }

        @JavascriptInterface public boolean copyText(String text) {
            try {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("林木课表", text));
                return true;
            } catch (RuntimeException error) { return false; }
        }

        @JavascriptInterface public void setAppearance(String value) {
            runOnUiThread(() -> {
                appearance = value;
                updateAppearance();
            });
        }
    }

    private void updateAppearance() {
        boolean systemDark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        boolean dark = "dark".equals(appearance) || ("system".equals(appearance) && systemDark);
        int color = Color.parseColor(dark ? "#1b211d" : "#ffffff");
        root.setBackgroundColor(color);
        if (webView != null) webView.setBackgroundColor(color);
        getWindow().setStatusBarColor(color);
        getWindow().setNavigationBarColor(color);
        int flags = dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SELECT_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        updateAppearance();
        refreshDate();
    }

    @Override protected void onResume() { super.onResume(); refreshDate(); }

    private void refreshDate() {
        if (webView != null) webView.evaluateJavascript("window.dispatchEvent(new Event('linmu-resume'))", null);
    }

    @Override public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("window.linmuBack ? window.linmuBack() : false", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }

    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (webView != null) { root.removeView(webView); webView.removeJavascriptInterface("LinmuNative"); webView.destroy(); }
        super.onDestroy();
    }
}
