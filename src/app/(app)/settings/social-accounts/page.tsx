import type { Metadata } from "next";
import { getLists } from "@/server/queries/lists";
import { SocialAccountsEditor } from "./social-accounts-editor";

export const metadata: Metadata = { title: "Settings" };

export default async function SocialAccountsPage() {
  const lists = await getLists();
  return <SocialAccountsEditor accounts={lists.socialAccounts} />;
}
