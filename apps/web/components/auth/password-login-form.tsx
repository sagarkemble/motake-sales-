"use client";

import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/hooks/use-auth";
import { usePasswordLoginStore } from "~/lib/login-store";

const minPasswordLength = 8;

const passwordLoginFormSchema = z.object({
  email: z.string().min(1, "Enter your email").email("Enter a valid email"),
  password: z.string().min(minPasswordLength, `Password must be at least ${minPasswordLength} characters`),
});

export function PasswordLoginForm() {
  const router = useRouter();
  const { signInWithEmailAndPassword } = useAuth({ enabled: false });

  const email = usePasswordLoginStore((state) => state.email);
  const password = usePasswordLoginStore((state) => state.password);
  const isPasswordVisible = usePasswordLoginStore((state) => state.isPasswordVisible);
  const isSubmitting = usePasswordLoginStore((state) => state.isSubmitting);
  const formError = usePasswordLoginStore((state) => state.formError);
  const setEmail = usePasswordLoginStore((state) => state.setEmail);
  const setPassword = usePasswordLoginStore((state) => state.setPassword);
  const toggleIsPasswordVisible = usePasswordLoginStore((state) => state.toggleIsPasswordVisible);
  const setIsSubmitting = usePasswordLoginStore((state) => state.setIsSubmitting);
  const setFormError = usePasswordLoginStore((state) => state.setFormError);

  const remainingPasswordCharacters = minPasswordLength - password.length;
  const showRemainingPasswordCharactersHint = password.length > 0 && remainingPasswordCharacters > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsedForm = passwordLoginFormSchema.safeParse({ email: email.trim(), password });
    if (!parsedForm.success) {
      setFormError(parsedForm.error.issues[0]?.message ?? "Enter a valid email and password");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(parsedForm.data);
      toast.success("Signed in");
      router.push("/");
    } catch {
      setFormError("Wrong email or password. Try again.");
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-email">Email</Label>
        <Input
          id="password-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@motake.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="h-10"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-password">Password</Label>
        <div className="relative">
          <Input
            id="password-password"
            type={isPasswordVisible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="h-10 pr-11"
          />
          <button
            type="button"
            onClick={toggleIsPasswordVisible}
            aria-label={isPasswordVisible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isPasswordVisible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
        {showRemainingPasswordCharactersHint && (
          <p className="text-xs text-muted-foreground">
            {remainingPasswordCharacters} more character{remainingPasswordCharacters === 1 ? "" : "s"} needed
          </p>
        )}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-10 bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}
