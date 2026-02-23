"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useMemo } from "react";

export const Assistant = () => {
  const sessionId = useMemo(() => {
    if (typeof window === 'undefined') return 'default';
    const saved = localStorage.getItem('chatSessionId');
    if (saved) return saved;
    const newId = `web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('chatSessionId', newId);
    return newId;
  }, []);

  const transport = useMemo(() => {
    return new AssistantChatTransport({
      api: "/api/chat",
      fetch: async (input, init) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const modifiedBody = JSON.stringify({
          ...body,
          sessionId: sessionId
        });

        return fetch(input, {
          ...init,
          body: modifiedBody,
          headers: {
            ...init?.headers,
            'Content-Type': 'application/json',
          },
        });
      }
    });
  }, [sessionId]);

  const runtime = useChatRuntime({
    transport,
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="#">
                      AI Chat
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Web Assistant</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>
            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};