import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { useRemindersStore } from "@/store/useRemindersStore";
import { makeBackup, readBackup, newRecords } from "@/lib/backup/backup";
import { todayDateString } from "@/lib/astronomy/dateUtils";

/**
 * Saving the records to a file and reading them back. The file goes out
 * through the share sheet, so it lands wherever the person keeps files (Files,
 * Drive, a message to themselves) and TRACE never needs a server for it.
 */
export function useBackup() {
  const [busy, setBusy] = useState<null | "save" | "restore">(null);

  const save = useCallback(async () => {
    const { milestones } = useMilestonesStore.getState();
    if (milestones.length === 0) {
      Alert.alert("Nothing to back up yet", "Add a date first, and it can be saved from here.");
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Sharing unavailable", "This phone cannot share files from TRACE.");
      return;
    }
    setBusy("save");
    try {
      const backup = makeBackup(milestones, useRemindersStore.getState().enabled);
      const uri = `${FileSystem.cacheDirectory}trace-records-${todayDateString()}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup, null, 2));
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        UTI: "public.json",
        dialogTitle: "Save your TRACE records",
      });
    } catch (err) {
      Alert.alert("Backup failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  }, []);

  const restore = useCallback(async () => {
    setBusy("restore");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "public.json"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      const read = readBackup(text);
      if (!read.ok) {
        Alert.alert("Could not restore", read.reason);
        return;
      }
      const store = useMilestonesStore.getState();
      const adding = newRecords(store.milestones, read.milestones);
      const already = read.milestones.length - adding.length;
      const parts = [
        adding.length === 1 ? "1 record added." : `${adding.length} records added.`,
        already > 0 ? `${already} already on this phone, kept as they are.` : "",
        read.skipped > 0 ? `${read.skipped} could not be read and were left out.` : "",
      ].filter(Boolean);
      if (adding.length > 0) {
        store.importMilestones(adding);
        const bells = useRemindersStore.getState();
        for (const m of adding) if (read.reminders.includes(m.id)) bells.set(m.id, true);
      }
      Alert.alert(adding.length > 0 ? "Restored" : "Nothing new to add", parts.join(" "));
    } catch (err) {
      Alert.alert("Could not restore", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  }, []);

  return { busy, save, restore };
}
