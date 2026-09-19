function retiredWorkspace() {
  return Response.json({ error: 'This workspace has moved. Open the teaching portal to continue.', url: '/' }, { status: 410 });
}

export const GET = retiredWorkspace;
export const POST = retiredWorkspace;
