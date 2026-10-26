package com.worldhistory.atlas;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.print.PrintManager;
import android.util.Base64;
import android.util.TypedValue;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Thin native shell around the WorldHistory web app.
 *
 * The whole UI lives in `assets/www` (the Vite build). This activity only
 * provides what a WebView cannot do on its own: external links in the browser,
 * sharing, saving exported files, back-navigation and a loading indicator.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/www/index.html";
    private static final String ASSET_PREFIX = "file:///android_asset/";
    private static final long EXIT_TIMEOUT_MS = 2200L;

    private WebView webView;
    private ProgressBar progressBar;
    private long lastBackPress = 0L;

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#080D1B"));
        root.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        int barHeight = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 3, getResources().getDisplayMetrics());
        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, barHeight);
        progressBar.setLayoutParams(barParams);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        root.addView(progressBar);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(Color.parseColor("#080D1B"));
        root.addView(webView);

        configureWebView();
        webView.addJavascriptInterface(new AppBridge(), "AndroidBridge");

        webView.setWebViewClient(new LocalWebViewClient());
        webView.setWebChromeClient(new LocalWebChromeClient());

        setContentView(root);

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        settings.setTextZoom(100);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        // The bundled app is served from file://; it must be able to query
        // Wikipedia / OpenAlex / Crossref (all CORS-friendly) for live research.
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.setWebViewClient(null);
            webView.setWebChromeClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackPress < EXIT_TIMEOUT_MS) {
            super.onBackPressed();
            return;
        }
        lastBackPress = now;
        Toast.makeText(this, getString(R.string.exit_hint), Toast.LENGTH_SHORT).show();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Menu button on old devices opens the in-app menu overlay.
        if (keyCode == KeyEvent.KEYCODE_MENU && webView != null) {
            webView.evaluateJavascript("(function(){var b=document.querySelector('.menu');if(b)b.click();})()", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** Opens http(s) links in the device browser, keeps everything else inside. */
    private void openExternal(String url) {
        if (url == null) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
    }

    private boolean isOnline() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        NetworkInfo info = manager.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    /** Saves base64-encoded content into the app-private Downloads directory. */
    private void saveBase64File(String base64, String mime, String fileName) {
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = getFilesDir();
            if (!dir.exists() && !dir.mkdirs()) dir = getFilesDir();
            File target = new File(dir, fileName);
            FileOutputStream out = new FileOutputStream(target);
            try {
                out.write(bytes);
            } finally {
                out.close();
            }
            final String path = target.getAbsolutePath();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this,
                            getString(R.string.saved_to, path), Toast.LENGTH_LONG).show();
                }
            });
        } catch (Exception e) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, R.string.no_browser, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    /** Bridge exposed to the web app as `window.AndroidBridge`. */
    private final class AppBridge {

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public boolean isOnline() {
            return MainActivity.this.isOnline();
        }

        @JavascriptInterface
        public void share(String text) {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
            try {
                startActivity(Intent.createChooser(intent, null));
            } catch (ActivityNotFoundException ignored) {
            }
        }

        @JavascriptInterface
        public void openExternal(String url) {
            MainActivity.this.openExternal(url);
        }

        @JavascriptInterface
        public void saveFile(String base64, String mime, String fileName) {
            MainActivity.this.saveBase64File(base64, mime, fileName == null ? "export.txt" : fileName);
        }

        @JavascriptInterface
        public void reload() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (webView != null) webView.reload();
                }
            });
        }

        /** `window.print()` does nothing in a WebView, so printing goes native. */
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void printPage(final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (webView == null) return;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        if (printManager != null) {
                            String jobName = (title == null || title.length() == 0) ? "WorldHistory" : title;
                            printManager.print(jobName, webView.createPrintDocumentAdapter(jobName), null);
                            return;
                        }
                    }
                    Toast.makeText(MainActivity.this, R.string.no_browser, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    private final class LocalWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl() != null ? request.getUrl().toString() : null;
            if (url == null) return false;
            if (url.startsWith(ASSET_PREFIX) || url.startsWith("about:") || url.startsWith("file:")) {
                return false;
            }
            if (url.startsWith("http://") || url.startsWith("https://")) {
                openExternal(url);
                return true;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // Only the main frame matters: missing assets cannot be recovered by
            // the user, but a failed live request is handled inside the web app.
            if (request != null && !request.isForMainFrame()) return;
            String url = request != null && request.getUrl() != null ? request.getUrl().toString() : START_URL;
            int code = error != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? error.getErrorCode() : -1;
            String description = error != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? String.valueOf(error.getDescription())
                    : "unknown error";
            // Если не открылась даже стартовая страница, показываем понятный экран
            // вместо голой ошибки WebView.
            if (request == null || url.startsWith(ASSET_PREFIX)) {
                showDiagnostics(url, description, code);
                return;
            }
            if (!MainActivity.this.isOnline()) {
                Toast.makeText(MainActivity.this, R.string.offline_hint, Toast.LENGTH_LONG).show();
            }
        }
    }

    /** Friendly, self-explanatory screen for an unrecoverable loading error. */
    private void showDiagnostics(String url, String description, int code) {
        String asset = "/";
        if (url != null && url.startsWith(ASSET_PREFIX)) {
            asset = url.substring(ASSET_PREFIX.length());
        }
        String html = "<html><head><meta name='viewport' content='width=device-width, initial-scale=1'>"
                + "<style>body{margin:0;padding:28px;background:#080D1B;color:#E8EDF7;"
                + "font-family:sans-serif;line-height:1.5}"
                + "h1{font-size:19px;margin:0 0 12px;color:#FFD479}"
                + "code{background:#12203A;padding:2px 5px;border-radius:5px;font-size:13px;word-break:break-all}"
                + "p{margin:0 0 10px;font-size:14px;color:#A9B6CC}</style></head><body>"
                + "<h1>Не удалось открыть встроенное приложение</h1>"
                + "<p>Файл <code>" + asset + "</code> не найден в APK-архиве.</p>"
                + "<p>Код: " + code + " — " + description + "</p>"
                + "<p>Переустановите приложение последней сборкой: файлы веб-приложения должны "
                + "находиться в папке <code>assets/www</code>.</p></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html; charset=utf-8", null, null);
    }

    private final class LocalWebChromeClient extends WebChromeClient {

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            if (progressBar == null) return;
            progressBar.setProgress(newProgress);
            progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            // `target="_blank"` source links are handed to the device browser.
            final WebView popup = new WebView(MainActivity.this);
            popup.getSettings().setJavaScriptEnabled(true);
            popup.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView inner, WebResourceRequest request) {
                    openExternal(request.getUrl() != null ? request.getUrl().toString() : null);
                    return true;
                }
            });
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }
    }
}
