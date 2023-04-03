import buttons from "./buttons";

// TODO: i18n

function create(
  $store,
  transferID,
  transfers,
  action,
  agent,
  items,
  status = "Starting",
  icon = "folder_zip",
  stats = { progress: [], total: [] },
  pending = true,
  canceled = false,
  error = false
) {
  status = status || "starting";
  stats = stats || { progress: [], total: [] };
  let cancelable = true;
  let showDetails = false;
  let sseClient;
  let title = "";
  switch (action) {
    case "copy":
      title = "Copying ";
      break;
    case "move":
      title = "Moving ";
      break;
  }
  let plural = items.length > 1 ? "s" : "";
  title += `${items.length} item${plural} to ${agent.host}:${agent.port}`;

  if (!canceled && pending) {
    sseClient = new EventSource(`/api/sse/transfers/${transferID}/poll`);
    sseClient.onmessage = handleMessage($store, transfers);
    sseClient.onerror = handleError($store, transfers);
    sseClient.transferID = transferID;
  }

  let data = {
    agent,
    action,
    transferID,
    sseClient,
    title,
    pending,
    canceled,
    error,
    status,
    icon,
    items,
    stats,
    cancelable,
    showDetails,
  };
  $store.commit("addTransfer", data);

  storeAdd(data);
}

function get(transfers, transferID) {
  for (let transfer of transfers) {
    if (transfer.transferID === transferID) {
      return transfer;
    }
  }
}

function remove($store, transferID) {
  $store.commit("removeTransfer", transferID);
  storeRemove(transferID);
}

function update($store, data) {
  let newTransfers = [];
  let store;

  for (let transfer of $store.state.transfers) {
    let newTransfer = Object.fromEntries(Object.entries(transfer));
    if (transfer.transferID === data.transferID) {
      [
        "agent",
        "pending",
        "items",
        "error",
        "status",
        "icon",
        "progress",
        "stats",
        "canceled",
        "cancelable",
        "showDetails",
      ].forEach((attr) => {
        if (data[attr] !== undefined) {
          newTransfer[attr] = data[attr];
        }
      });

      let {
        transferID,
        title,
        status,
        icon,
        action,
        agent,
        items,
        pending,
        canceled,
        error,
        stats,
      } = newTransfer;
      store = {
        transferID,
        title,
        status,
        icon,
        action,
        agent,
        items,
        pending,
        canceled,
        error,
        stats,
      };
      storeUpdate(store);
    }
    newTransfers.push(newTransfer);
  }

  $store.commit("replaceTransfers", newTransfers);
}

function storeAdd(data) {
  let stored = localStorage.getItem("rc-transfers");
  stored = stored ? JSON.parse(stored) : [];
  if (stored.indexOf(data.transferID) === -1) {
    stored.push(data.transferID);
    localStorage.setItem("rc-transfers", JSON.stringify(stored));
  }
  storeUpdate(data);
}

function storeRemove(transferID) {
  let stored = localStorage.getItem("rc-transfers");
  stored = stored ? JSON.parse(stored) : [];
  let idxToRemove = stored.indexOf(transferID);
  if (idxToRemove > -1) {
    stored.splice(idxToRemove, 1);
  }
  localStorage.setItem("rc-transfers", JSON.stringify(stored));
  localStorage.removeItem(`transfer-${transferID}`);
}

function storeUpdate(data) {
  if (!data.transferID) return;
  localStorage.setItem(`transfer-${data.transferID}`, JSON.stringify(data));
}

function setButtonActive(transfers) {
  let pending = 0;
  let error = 0;
  for (let tr of transfers) {
    if (tr.pending) {
      pending += 1;
    }
    if (tr.error) {
      error += 1;
    }
  }

  buttons.active("transfers", pending > 0);

  buttons[pending > 0 ? "loadingPromise" : "donePromise"]("transfers").then(
    () => {
      buttons.icon("transfers", error === 0 ? "sync" : "sync_problem");
    }
  );
}

function handleError($store, transfers) {
  return function (event) {
    console.log("SSE Error > ", event, $store, transfers);
  };
}

function handleMessage($store, transfers) {
  return function (event) {
    if (!event.isTrusted) return;

    let icon,
      data,
      message,
      stats = { progress: [], total: [] },
      extra = "",
      pending = true,
      canceled = false,
      cancelable = true;

    if (event.data.indexOf("::") !== -1) {
      let s = event.data.split("::");
      message = s[0];
      data = s[1];
      if (typeof s[2] === "string") {
        extra = s[2];
      }
    } else {
      message = event.data;
    }
    switch (message) {
      case "archiving":
        icon = "folder_zip";
        cancelable = false;
        break;
      case "starting upload":
        icon = "drive_folder_upload";
        break;
      case "uploading":
        icon = "drive_folder_upload";
        break;
      case "extracting":
        icon = "drive_file_move";
        cancelable = false;
        break;
      case "complete":
        icon = "done";
        pending = false;
        break;
      case "progress":
        icon = "drive_folder_upload";
        if (data === "stats") {
          message = "uploading";
          stats = getStats(extra);
        }
        break;
      case "signal":
        message = extra;
        pending = false;
        canceled = true;
        icon = "highlight_off";
        break;
      default:
        // error case
        icon = "error_outline";

        update($store, {
          transferID: event.target.transferID,
          pending: false,
          error: true,
          status: message,
          icon,
          cancelable,
        });
        setTimeout(() => {
          setButtonActive(transfers);
        }, 100);

        return;
    }

    update($store, {
      transferID: event.target.transferID,
      status: message,
      pending,
      icon,
      stats,
      canceled,
      cancelable,
    });

    if (pending) {
      return;
    }
    setTimeout(() => {
      buttons
        .successPromise("transfers")
        .finally(() => setButtonActive(transfers));
    }, 100);
  };
}

function getStats(data) {
  let bytes = data.split("/");
  let progress = bytes[0];
  let total = bytes[1];
  let result = {};

  if (progress < 1024 * 1024) {
    result.progress = [...(progress / 1024).toFixed(2).split("."), "KB"];
  } else if (progress < 1024 * 1024 * 1024) {
    result.progress = [...(progress / 1024 / 1024).toFixed(2).split("."), "MB"];
  } else {
    result.progress = [
      ...(progress / 1024 / 1024 / 1024).toFixed(2).split("."),
      "GB",
    ];
  }
  if (total < 1024 * 1024) {
    result.total = [...(total / 1024).toFixed(2).split("."), "KB"];
  } else if (total < 1024 * 1024 * 1024) {
    result.total = [...(total / 1024 / 1024).toFixed(2).split("."), "MB"];
  } else {
    result.total = [
      ...(total / 1024 / 1024 / 1024).toFixed(2).split("."),
      "GB",
    ];
  }

  return result;
}

export default {
  create,
  get,
  update,
  remove,
  setButtonActive,
};
