import Link from "next/link";

export function UpgradePrompt({
  message,
  current,
  limit,
  planName,
}: {
  message?: string;
  current?: number;
  limit?: number;
  planName?: string;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800">
        {message ?? `已达到${planName ?? "当前套餐"}的使用上限`}
      </p>
      {current !== undefined && limit !== undefined && (
        <p className="mt-1 text-xs text-amber-700">
          当前使用：{current} / 上限：{limit}
        </p>
      )}
      <Link
        href="/settings/billing"
        className="mt-3 inline-block rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
      >
        升级套餐
      </Link>
    </div>
  );
}
