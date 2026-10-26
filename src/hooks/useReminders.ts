import { useCallback, useEffect, useState } from "react";
import { router, type Href } from "expo-router";
import { Linking, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useMilestonesStore, useMilestonesHydrated } from "@/store/useMilestonesStore";
import { useRemindersStore } from "@/store/useRemindersStore";
import { diffReminders, planReminders, reminderBody, REMINDER_HOUR } from "@/lib/reminders/planReminders";
import { anniversaryDate } from "@/lib/astronomy/anniversary";
import { todayDateString, parseDateString } from "@/lib/astronomy/dateUtils";

type NotificationsModule = typeof import("expo-notifications");

/**
 * expo-notifications throws at import time inside Expo Go on Android (removed
 * in SDK 53). A static import took the whole route tree down with it: _layout,
 * settings and milestone/[id] all lost their default export. The module is
 * loaded here instead, and every caller treats null as "reminders are not
 * available in this build". A development build or a store build gets the
 * real module.
 */
const Notifications: NotificationsModule | null = (() => {
  if (Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return null;
  }
  try {
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
})();

export const remindersAvailable = Notifications !== null;

const CHANNEL = "anniversaries";

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function sync(): Promise<void> {
  if (!Notifications) return;
  const { milestones } = useMilestonesStore.getState();
  const { enabled } = useRemindersStore.getState();
  const perms = await Notifications.getPermissionsAsync();
  const allowed = perms.granted || perms.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  const now = Date.now();
  const plan = allowed
    ? planReminders(milestones, enabled, todayDateString()).filter((p) => {
        const { year, month, day } = parseDateString(p.date);
        return new Date(year, month - 1, day, REMINDER_HOUR).getTime() > now;
      })
    : [];
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const { cancel, schedule } = diffReminders(
    scheduled.map((req) => req.identifier),
    plan
  );
  for (const identifier of cancel) await Notifications.cancelScheduledNotificationAsync(identifier);

  if (Platform.OS === "android" && plan.length > 0) {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Anniversaries",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  for (const { identifier, reminder: p } of schedule) {
    const { year, month, day } = parseDateString(p.date);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: p.title, body: p.body, data: { milestoneId: p.milestoneId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(year, month - 1, day, REMINDER_HOUR, 0, 0),
        channelId: CHANNEL,
      },
    });
  }
}

/** One sync at a time; a request that lands mid-sync runs once more after it. */
let running = false;
let again = false;
async function requestSync(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await sync();
    } while (again);
  } catch {
    // A failed sync leaves whatever was scheduled; the next change retries.
  } finally {
    running = false;
  }
}

/**
 * Keeps the phone's pending notifications in step with the records. Mounted
 * once at the root: it runs on launch, and again whenever a record or a bell
 * changes, which is what keeps the plan inside iOS's 64 and never stale.
 */
export function useReminderSync(): void {
  const milestonesReady = useMilestonesHydrated();
  const bellsReady = useRemindersHydrated();
  const milestones = useMilestonesStore((s) => s.milestones);
  const enabled = useRemindersStore((s) => s.enabled);
  const prune = useRemindersStore((s) => s.prune);

  // BOTH stores, not just the records. Waiting on the records alone let a sync
  // run while the bells still read as none, which cancelled every reminder on
  // the phone and scheduled them all again a moment later, on every launch.
  useEffect(() => {
    if (!milestonesReady || !bellsReady) return;
    prune(milestones.map((m) => m.id));
    requestSync();
  }, [milestonesReady, bellsReady, milestones, enabled, prune]);
}

function useRemindersHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useRemindersStore.persist.hasHydrated());
  useEffect(() => {
    if (useRemindersStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useRemindersStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}

/** The last tap already acted on, so a remount does not open the record twice. */
let handledTap: string | null = null;

/**
 * A tap on a reminder opens the record it is about. It used to open the app on
 * Home, one search away from the night the notification had just described.
 * Mounted inside the navigator, so a tap that cold-starts the app waits for a
 * stack to push onto.
 */
export function useReminderTaps(): void {
  // Constant for the life of the process, so the hook order never changes.
  const response = Notifications ? Notifications.useLastNotificationResponse() : null;
  const milestones = useMilestonesStore((s) => s.milestones);
  const ready = useMilestonesHydrated();

  useEffect(() => {
    if (!Notifications || !response || !ready) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.content.data?.milestoneId;
    const key = `${response.notification.request.identifier}@${response.notification.date}`;
    if (typeof id !== "string" || handledTap === key) return;
    handledTap = key;
    // A record deleted since the reminder was scheduled has nothing to open.
    if (milestones.some((m) => m.id === id)) router.push(`/milestone/${id}` as Href);
  }, [response, ready, milestones]);
}

export type BellState = "on" | "off" | "blocked";

/**
 * The bell on one record. The first tap asks for permission; a refusal turns
 * the bell into a way to Settings, because asking again after a no shows
 * nothing on either platform.
 */
export function useReminderBell(milestoneId: string) {
  const on = useRemindersStore((s) => s.enabled.includes(milestoneId));
  const setOn = useRemindersStore((s) => s.set);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!Notifications) return;
    let alive = true;
    Notifications.getPermissionsAsync().then((p) => {
      if (alive) setBlocked(!p.granted && !p.canAskAgain);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (!Notifications) return;
    if (on) {
      setOn(milestoneId, false);
      return;
    }
    let perms = await Notifications.getPermissionsAsync();
    if (!perms.granted && perms.canAskAgain) perms = await Notifications.requestPermissionsAsync();
    if (perms.granted || perms.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      setBlocked(false);
      setOn(milestoneId, true);
    } else {
      setBlocked(true);
      if (!perms.canAskAgain) Linking.openSettings();
    }
  }, [on, milestoneId, setOn]);

  const state: BellState = on ? "on" : blocked ? "blocked" : "off";
  return { state, toggle };
}

/**
 * Sends one reminder ten seconds from now, written the way the soonest
 * record's real one will be, so a person can see what arrives on the day
 * without waiting a year for it. Its id sits outside the "trace:" prefix, so a
 * sync running meanwhile leaves it alone.
 */
export async function sendTestReminder(): Promise<"sent" | "blocked" | "unavailable"> {
  if (!Notifications) return "unavailable";
  let perms = await Notifications.getPermissionsAsync();
  if (!perms.granted && perms.canAskAgain) perms = await Notifications.requestPermissionsAsync();
  const allowed = perms.granted || perms.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!allowed) {
    if (!perms.canAskAgain) Linking.openSettings();
    return "blocked";
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Anniversaries",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const today = todayDateString();
  const soonest = [...useMilestonesStore.getState().milestones]
    .map((m) => ({ m, next: anniversaryDate(m, today) }))
    .sort((a, b) => a.next.daysLeft - b.next.daysLeft)[0];
  await Notifications.scheduleNotificationAsync({
    identifier: `trace-test:${Date.now()}`,
    content: soonest
      ? {
          title: soonest.m.title,
          body: reminderBody(soonest.m, soonest.next.year),
          data: { milestoneId: soonest.m.id },
        }
      : {
          title: "TRACE",
          body: "Reminders work. Turn on the bell on any date and one arrives on its night.",
        },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
      channelId: CHANNEL,
    },
  });
  return "sent";
}
