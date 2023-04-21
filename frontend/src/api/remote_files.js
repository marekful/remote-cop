import { fetchURL, removePrefix } from "./utils";

export async function fetch(agentId, url) {
  url = removePrefix(url);

  const res = await fetchURL(
    `/api/remote/${agentId}/resources/${encodeURIComponent(url)}`,
    {}
  );

  if (res.status !== 200) {
    throw new Error(await res.text());
  }

  let data = await res.json();

  data = JSON.parse(data);

  data.url = `/files${url}`;

  if (data.isDir) {
    if (!data.url.endsWith("/")) data.url += "/";
    data.items = data.items.map((item, index) => {
      item.index = index;
      item.url = `${data.url}${encodeURIComponent(item.name)}`;

      if (item.isDir) {
        item.url += "/";
      }

      return item;
    });
  }

  return data;
}

function moveCopyStart(
  agentID,
  items,
  copy = false,
  overwrite = false,
  rename = false,
  compress = false
) {
  let requestItems = [];
  for (let item of items) {
    const source = item.from;
    const destination = encodeURIComponent(removePrefix(item.to));
    requestItems.push({ source, destination, overwrite, rename });
  }
  const action = copy ? "remote-copy" : "remote-rename";
  const query = `?action=${action}&compress=${compress}`;

  return remoteResourceAction(
    agentID,
    query,
    "POST",
    JSON.stringify(requestItems)
  );
}

export function moveStart(
  agentID,
  items,
  overwrite = false,
  rename = false,
  compress = false
) {
  return moveCopyStart(agentID, items, false, overwrite, rename, compress);
}

export function copyStart(
  agentID,
  items,
  overwrite = false,
  rename = false,
  compress = false
) {
  return moveCopyStart(agentID, items, true, overwrite, rename, compress);
}

async function remoteResourceAction(agentID, query, method, content) {
  let opts = { method };

  if (content) {
    opts.body = content;
  }
  if (method === "POST") {
    opts.headers = { "Content-Type": "application/json" };
  }

  return fetchURL(`/api/remote/${agentID}/copy${query}`, opts).then((res) =>
    res.json()
  );
}

export async function cancelTransfer(agentID, transferID) {
  let opts = { method: "DELETE" };
  return fetchURL(`/api/remote/${agentID}/transfers/${transferID}`, opts).catch(
    (err) => {
      throw new Error(err);
    }
  );
}
