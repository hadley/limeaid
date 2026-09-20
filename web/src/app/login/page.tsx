import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function login(formData: FormData) {
  "use server";
  const password = formData.get("password");
  if (password === process.env.APP_PASSWORD) {
    const jar = await cookies();
    jar.set("mealime_auth", String(password), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    redirect("/recipes");
  }
  redirect("/login?error=1");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="container narrow">
      <h1>Sign in</h1>
      <form action={login} className="filters">
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
        />
        <button type="submit">Sign in</button>
      </form>
      {error && <p className="error">Wrong password.</p>}
    </main>
  );
}
