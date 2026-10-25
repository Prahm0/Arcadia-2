import SwiftUI
import WidgetKit

private let appGroup = "group.app.arcadiahq.arcadia"
private let snapshotKey = "arcadia.widget.snapshot"

private struct ArcadiaSnapshot: Decodable {
    struct Today: Decodable {
        let minutes: Int
        let plannedMinutes: Int
        let streakDays: Int
    }

    struct NextBlock: Decodable {
        let id: String
        let title: String
        let subject: String?
        let startAt: String
        let endAt: String
        let isNow: Bool
    }

    let version: Int
    let updatedAt: String
    let today: Today
    let next: NextBlock?
}

private struct ArcadiaWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: ArcadiaSnapshot?
}

private struct ArcadiaWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> ArcadiaWidgetEntry {
        ArcadiaWidgetEntry(date: .now, snapshot: previewSnapshot)
    }

    func getSnapshot(in context: Context, completion: @escaping (ArcadiaWidgetEntry) -> Void) {
        completion(ArcadiaWidgetEntry(date: .now, snapshot: loadSnapshot() ?? previewSnapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ArcadiaWidgetEntry>) -> Void) {
        let entry = ArcadiaWidgetEntry(date: .now, snapshot: loadSnapshot())
        // The host app also requests an immediate reload after any dashboard
        // change. This fallback keeps relative time labels fresh.
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
    }

    private func loadSnapshot() -> ArcadiaSnapshot? {
        guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
              let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(ArcadiaSnapshot.self, from: data)
    }
}

private let previewSnapshot = ArcadiaSnapshot(
    version: 1,
    updatedAt: "",
    today: .init(minutes: 45, plannedMinutes: 90, streakDays: 4),
    next: .init(id: "preview", title: "Chemistry revision", subject: "Chemistry", startAt: "", endAt: "", isNow: false)
)

private enum ArcadiaStyle {
    static let sage = Color(red: 47 / 255, green: 74 / 255, blue: 58 / 255)
    static let ink = Color(red: 29 / 255, green: 42 / 255, blue: 34 / 255)
    static let paper = Color(red: 243 / 255, green: 241 / 255, blue: 234 / 255)
    static let gold = Color(red: 184 / 255, green: 135 / 255, blue: 54 / 255)
}

private func appURL(_ path: String = "") -> URL {
    URL(string: "arcadia://app\(path)")!
}

private func durationText(_ minutes: Int) -> String {
    if minutes < 60 { return "\(minutes) min" }
    let hours = minutes / 60
    let remainder = minutes % 60
    return remainder == 0 ? "\(hours)h" : "\(hours)h \(remainder)m"
}

private func isoDate(_ value: String) -> Date? {
    ISO8601DateFormatter().date(from: value)
}

private struct EmptyWidgetState: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Arcadia", systemImage: "sparkle")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ArcadiaStyle.sage)
            Spacer()
            Text("Open Arcadia to see your plan.")
                .font(.headline)
                .foregroundStyle(ArcadiaStyle.ink)
            Text("Your study plan stays here.")
                .font(.caption)
                .foregroundStyle(ArcadiaStyle.ink.opacity(0.62))
        }
        .padding()
        .background(ArcadiaStyle.paper)
    }
}

struct ArcadiaUpNextWidget: Widget {
    let kind = "ArcadiaUpNextWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ArcadiaWidgetProvider()) { entry in
            if let block = entry.snapshot?.next {
                UpNextWidgetView(block: block)
            } else {
                EmptyWidgetState()
            }
        }
        .configurationDisplayName("Up next")
        .description("Your next Arcadia study block.")
        .supportedFamilies([.systemMedium])
    }
}

private struct UpNextWidgetView: View {
    let block: ArcadiaSnapshot.NextBlock

    var body: some View {
        let destination = appURL("/sessions?eventId=\(block.id)&start=1")
        Link(destination: destination) {
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Label(block.isNow ? "Now" : "Up next", systemImage: block.isNow ? "play.fill" : "clock")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ArcadiaStyle.sage)
                    Spacer()
                    Text("Arcadia")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ArcadiaStyle.ink.opacity(0.52))
                }
                Spacer(minLength: 0)
                Text(block.subject ?? "Study")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ArcadiaStyle.ink.opacity(0.65))
                Text(block.title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(ArcadiaStyle.ink)
                    .lineLimit(2)
                if let start = isoDate(block.startAt), let end = isoDate(block.endAt) {
                    HStack(spacing: 5) {
                        if block.isNow {
                            if #available(iOS 16.0, *) {
                                Text(timerInterval: Date()...end, countsDown: true)
                            } else {
                                Text(end, style: .time)
                            }
                            Text("left")
                        } else {
                            Text(start, style: .relative)
                            Text("to start")
                        }
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ArcadiaStyle.sage)
                } else {
                    Text("Tap to start")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(ArcadiaStyle.sage)
                }
            }
            .padding()
        }
        .background(ArcadiaStyle.paper)
    }
}

struct ArcadiaTodayWidget: Widget {
    let kind = "ArcadiaTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ArcadiaWidgetProvider()) { entry in
            TodayWidgetView(today: entry.snapshot?.today)
        }
        .configurationDisplayName("Today")
        .description("Today's focus and your streak.")
        .supportedFamilies([.systemSmall])
    }
}

private struct TodayWidgetView: View {
    let today: ArcadiaSnapshot.Today?

    var body: some View {
        let studied = today?.minutes ?? 0
        let planned = today?.plannedMinutes ?? 0
        let ratio = planned > 0 ? min(1, Double(studied) / Double(planned)) : 0
        Link(destination: appURL()) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Today")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ArcadiaStyle.sage)
                    Spacer()
                    Text("✦ \(today?.streakDays ?? 0)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ArcadiaStyle.gold)
                }
                Spacer(minLength: 0)
                ZStack {
                    Circle().stroke(ArcadiaStyle.sage.opacity(0.15), lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: ratio)
                        .stroke(ArcadiaStyle.sage, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text(durationText(studied))
                        .font(.headline.weight(.bold))
                        .foregroundStyle(ArcadiaStyle.ink)
                }
                .frame(maxWidth: .infinity, maxHeight: 68)
                Text(planned > 0 ? "of \(durationText(planned)) planned" : "Focus when you are ready")
                    .font(.caption)
                    .foregroundStyle(ArcadiaStyle.ink.opacity(0.62))
                    .frame(maxWidth: .infinity)
            }
            .padding()
        }
        .background(ArcadiaStyle.paper)
    }
}

struct ArcadiaFocusWidget: Widget {
    let kind = "ArcadiaFocusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ArcadiaWidgetProvider()) { entry in
            FocusWidgetView(block: entry.snapshot?.next)
        }
        .configurationDisplayName("Start focus")
        .description("Open Arcadia and start a focus session.")
        .supportedFamilies([.systemSmall])
    }
}

private struct FocusWidgetView: View {
    let block: ArcadiaSnapshot.NextBlock?

    var body: some View {
        let path = block.map { "/sessions?eventId=\($0.id)&start=1" } ?? "/sessions"
        Link(destination: appURL(path)) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "play.fill")
                        .font(.caption.weight(.bold))
                    Text("Focus")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Text("Arcadia")
                        .font(.caption2.weight(.semibold))
                        .opacity(0.68)
                }
                .foregroundStyle(.white.opacity(0.86))
                Spacer(minLength: 0)
                Text(block?.subject ?? "Ready when you are")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.white.opacity(0.72))
                Text(block?.title ?? "Start a session")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                Text("Tap to begin")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.white.opacity(0.8))
            }
            .padding()
        }
        .background(ArcadiaStyle.sage)
    }
}

@main
struct ArcadiaWidgets: WidgetBundle {
    var body: some Widget {
        ArcadiaUpNextWidget()
        ArcadiaTodayWidget()
        ArcadiaFocusWidget()
    }
}
