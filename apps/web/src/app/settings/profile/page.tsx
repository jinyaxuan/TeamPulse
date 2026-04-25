import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">个人资料</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理你的显示名称、头像和密码。用户名在设备审批时确定，这里不能修改。
        </p>
      </div>

      <ProfileForm
        current={{
          name: user.name,
          display_name: user.displayName,
          email: user.email,
          avatar_url: user.avatarUrl,
          role: user.role,
          has_password: Boolean(user.passwordHash),
        }}
      />
    </div>
  );
}
