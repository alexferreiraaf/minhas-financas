
"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useFirebase, useUser, initiateEmailSignIn, initiateEmailSignUp } from '@/firebase';
import { CreditCard, Loader, AlertTriangle, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ThemeToggleButton } from '@/components/theme-toggle';


const formSchema = z.object({
  email: z.string().email({ message: "Por favor, insira um e-mail válido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
});

type FormValues = z.infer<typeof formSchema>;

export default function LoginPage() {
  const { auth } = useFirebase();
  const { user, isUserLoading, userError } = useUser();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tab, setTab] = useState<'login' | 'signup'>('login');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });
  
  useEffect(() => {
    if (!isUserLoading && user) {
      window.location.href = '/';
    }
  }, [user, isUserLoading]);
  
  useEffect(() => {
    if (userError) {
        let friendlyMessage = "Ocorreu um erro durante a autenticação. Por favor, tente novamente.";
        
        // This is a basic way to check for common Firebase Auth errors.
        // In a real app, you might want more specific checks.
        if (userError.message.includes("auth/user-not-found")) {
            friendlyMessage = "Nenhum usuário encontrado com este e-mail.";
        } else if (userError.message.includes("auth/wrong-password")) {
            friendlyMessage = "Senha incorreta. Por favor, tente novamente.";
        } else if (userError.message.includes("auth/email-already-in-use")) {
            friendlyMessage = "Este e-mail já está em uso por outra conta.";
        }
        
        setAuthError(friendlyMessage);
        setIsSubmitting(false); // Re-enable form
    } else {
        setAuthError(null);
    }
  }, [userError]);


  const onSubmit = (values: FormValues) => {
    if (!auth) return;
    setIsSubmitting(true);
    setAuthError(null);

    if (tab === 'login') {
      initiateEmailSignIn(auth, values.email, values.password);
    } else {
      initiateEmailSignUp(auth, values.email, values.password);
    }
  };
  
  if (isUserLoading || user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <Loader className="animate-spin text-primary mb-4" size={48} />
        <p className="text-foreground/80 font-medium">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
          <ThemeToggleButton />
      </div>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary text-primary-foreground rounded-full h-16 w-16 flex items-center justify-center mb-4">
              <CreditCard className="h-8 w-8" />
          </div>
          <CardTitle className="text-3xl font-bold">Minhas Finanças</CardTitle>
          <CardDescription>Seu controle financeiro, simplificado.</CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs value={tab} onValueChange={(value) => setTab(value as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Entrar</TabsTrigger>
                    <TabsTrigger value="signup">Criar Conta</TabsTrigger>
                </TabsList>
                <div className="pt-6">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                             {authError && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Erro de Autenticação</AlertTitle>
                                    <AlertDescription>{authError}</AlertDescription>
                                </Alert>
                            )}
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>E-mail</FormLabel>
                                    <FormControl>
                                    <Input placeholder="seu@email.com" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Senha</FormLabel>
                                    <FormControl>
                                    <Input type="password" placeholder="••••••••" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    tab === 'login' ? <LogIn className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />
                                )}
                                {tab === 'login' ? 'Entrar' : 'Criar Conta'}
                            </Button>
                        </form>
                    </Form>
                </div>
            </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
