import XCTest

@MainActor
final class AppUITests: XCTestCase {
    private let app = XCUIApplication()

    private func button(_ label: String) -> XCUIElement {
        let query = label.hasPrefix("Ghost ink:") ? app.webViews.switches : app.webViews.buttons
        let element = query.matching(NSPredicate(format: "label CONTAINS %@", label)).firstMatch
        let exists = element.waitForExistence(timeout: 15)
        if !exists {
            capture("missing-control")
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
        }
        XCTAssertTrue(exists, "Missing game control: \(label)")
        return element
    }

    /// The title opens on the campaign tab; the free-play scroll buttons sit behind the "Free play" tab and
    /// are created only after fonts and native settings have loaded. A tab tap before the game boots does
    /// nothing, so keep tapping until a scroll button shows.
    private func openFreePlay() {
        let tab = button("Free play")
        let scroll = app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS %@", "The Wave Road")).firstMatch
        for _ in 1...15 {
            tab.tap()
            if scroll.waitForExistence(timeout: 2) { return }
        }
        _ = button("The Wave Road")
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testRunPauseBackgroundAndSavedPreferences() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .landscapeLeft
        app.launch()
        // The traveler buttons exist in the initial HTML before the game is ready; the scroll buttons don't.
        openFreePlay()
        Thread.sleep(forTimeInterval: 1)
        capture("01-menu")

        button("The Wave Road").tap()
        button("Kohaku").tap()
        // XCTest accessibility snapshots can slow the intro's animation frames on CI.
        Thread.sleep(forTimeInterval: 3)
        let jump = button("Jump")
        jump.tap()

        let view = app.webViews.firstMatch
        let start = view.coordinate(withNormalizedOffset: CGVector(dx: 0.42, dy: 0.63))
        let end = view.coordinate(withNormalizedOffset: CGVector(dx: 0.68, dy: 0.55))
        // Painting opens when the intro ends, which takes longer on a slow simulator's frame rate.
        var committed = false
        for attempt in 1...8 {
            start.press(forDuration: 0.1, thenDragTo: end)
            capture("02-painted-run-\(attempt)")
            button("Pause game").tap()
            committed = button("Undo last stroke").isEnabled
            if committed { break }
            button("Continue").tap()
            Thread.sleep(forTimeInterval: 1)
        }
        capture("03-paused")
        XCTAssertTrue(committed, "A native finger stroke should be committed")

        let ghosts = button("Ghost ink:")
        if ghosts.label.contains("on") { ghosts.tap() }
        XCTAssertTrue(button("Ghost ink: off").exists)
        button("Undo last stroke").tap()
        _ = button("Pause game")

        XCUIDevice.shared.press(.home)
        app.activate()
        _ = button("Continue")
        capture("04-background-return")
        button("Choose scroll").tap()
        _ = button("Kohaku")

        app.terminate()
        app.launch()
        XCUIDevice.shared.orientation = .landscapeLeft
        openFreePlay()
        button("Kohaku").tap()
        Thread.sleep(forTimeInterval: 3)
        button("Pause game").tap()
        _ = button("Continue")
        XCTAssertTrue(button("Ghost ink: off").exists, "Ghost preference should survive a native app restart")
        capture("05-restored-preferences")
        app.terminate()
    }
}
