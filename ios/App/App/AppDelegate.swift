import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Firebase is required on iOS so the JS layer receives an FCM token
        // (the same format Android already uses). Without GoogleService-Info.plist
        // the app still launches; push registration then fails with a clear error.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Capacitor's Push Notifications plugin only learns about the device token if
    // we forward Apple's callbacks. Without this, JS waits forever and times out.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        if FirebaseApp.app() != nil {
            // TestFlight / App Store builds must be tagged production. If this is
            // left as unknown, FCM sometimes treats the token as sandbox and then
            // send fails with invalid APNs credentials when only a Production key is uploaded.
            #if DEBUG
            Messaging.messaging().setAPNSToken(deviceToken, type: .sandbox)
            #else
            Messaging.messaging().setAPNSToken(deviceToken, type: .prod)
            #endif
            Messaging.messaging().token { token, error in
                if let error = error {
                    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
                } else if let token = token {
                    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
                } else {
                    let missing = NSError(
                        domain: "PushRegistration",
                        code: 2,
                        userInfo: [NSLocalizedDescriptionKey: "Firebase did not return an FCM token for this iPhone."]
                    )
                    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: missing)
                }
            }
            return
        }

        let missingPlist = NSError(
            domain: "PushRegistration",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "GoogleService-Info.plist is missing. Add the iOS app (bundle ID com.laalbutton.app) in Firebase Console, put the plist in ios/App/App/, and rebuild."]
        )
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: missingPlist)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
