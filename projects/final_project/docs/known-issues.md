# Known Issues

## Read Retry Can Return Newer Data Than The Original Read

The master retries pending child read requests through `AsyncInjection`.
Those retries are not transport-only retries; each retry sends a fresh read
request to the minion for the same offset and length.

Because of that, a delayed read can observe storage after later writes have
already completed. In other words, the system does not currently guarantee that
a read returns a snapshot from the time the original read was first issued.

Impact:
- A read request can return stale data or newer-than-expected data relative to
  surrounding writes.
- Late duplicate responses are not merged by version or epoch; the first
  matching completion that is accepted for that child request wins.

Relevant code:
- `concrete/master/src/MasterCommands.cpp`
- `concrete/master/src/MasterRuntime.cpp`
- `framework/src/AsyncInjection.cpp`

## No Per-Offset Or Per-Range Serialization For Overlapping Requests

The framework dispatches work onto a multi-threaded thread pool. The current
master/minion path does not serialize overlapping reads and writes for the same
logical offset or range.

Two same-offset writes received from NBD are both converted into tasks, but
their execution order is not guaranteed end-to-end. The system also does not
currently enforce "write 1 must complete before write 2" for overlapping
requests.

Impact:
- Two writes to the same offset can race.
- A read overlapping a write can race with that write.
- Final persisted data may depend on scheduling and message arrival order rather
  than request arrival order at NBD.

Relevant code:
- `framework/src/Framework.cpp`
- `framework/src/ThreadPool.cpp`
- `concrete/master/src/NBDProxy.cpp`
- `concrete/master/src/MinionProxy.cpp`
- `concrete/minion/src/MinionCommands.cpp`
- `concrete/minion/src/MinionStorageBackend.cpp`

## UDP Transport Does Not Preserve Write Ordering Guarantees

Master-to-minion requests are sent over UDP. The current implementation does
not add its own sequencing or ordering layer for overlapping writes.

Impact:
- Even if two writes are observed in order on the master side, the transport
  path does not guarantee in-order delivery to the minion.
- Overlapping writes can be applied in a different order than the one in which
  they were accepted from NBD.

Relevant code:
- `concrete/master/src/MinionProxy.cpp`
- `concrete/minion/src/MasterProxy.cpp`

## NBD Reply Writes Are Not Serialized On The Master

The master uses a Unix `SOCK_STREAM` socketpair for the NBD userspace link.
`SendReply()` writes the reply header and payload in separate `write()` calls,
and the current path does not visibly serialize concurrent reply writes.

Because request completions can arrive from worker-thread execution paths,
multiple replies can race on the same stream file descriptor.

Impact:
- Reply header/payload bytes from different requests can interleave.
- This is a correctness bug independent of logical offset ordering.

Relevant code:
- `concrete/master/src/NBDCommunicator.cpp`
- `concrete/master/src/NBDProxy.cpp`
- `concrete/master/app/MasterNBDMain.cpp`
