import { labelCls } from "@/components/ui";

/**
 * Public or private, asked of whoever proposes an event. The admin who
 * confirms it sees the answer and can change it, so this is a request, not a
 * setting. Posts `visibility=public|private`.
 */
export function VisibilityChoice({
  defaultValue,
  privateHint,
}: {
  defaultValue?: string;
  /** What members see on the day when it's private — differs by event kind. */
  privateHint: string;
}) {
  const isPrivate = defaultValue === "private";
  return (
    <fieldset>
      <legend className={labelCls}>Who should know about it?</legend>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="visibility"
            value="public"
            defaultChecked={!isPrivate}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Public</span>
            <span className="block text-xs text-slate-500">
              Listed on the office site, so members can see it and sign up.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="visibility"
            value="private"
            defaultChecked={isPrivate}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Private</span>
            <span className="block text-xs text-slate-500">{privateHint}</span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
