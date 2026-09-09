package com.laalbutton.app;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the WebView between the status bar and the system nav so the
        // clock and Android buttons are not drawn on top of the app chrome.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(true);
        insetsController.setAppearanceLightNavigationBars(true);
    }
}
