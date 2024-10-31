// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface IProofOfCreditScore {
    /**
     * @notice Emitted when a new credit score task is created.
     * @param taskIndex The unique index for the created task.
     * @param task The Task struct containing the task's details, including the credit score.
     */
    event NewTaskCreated(uint32 indexed taskIndex, Task task);

    /**
     * @notice Emitted when a response to a credit score task is received.
     * @param taskIndex The unique index of the responded task.
     * @param task The Task struct containing the task's details.
     * @param operator The address of the operator responding to the task.
     */
    event TaskResponded(uint32 indexed taskIndex, Task task, address operator);

    struct Task {
        string name; // Description or name of the task (e.g., "Credit Score Verification")
        uint32 taskCreatedBlock; // The block at which the task was created
        string username; // The username of the user who created the task
        address userAddress; // The address of the user who created the task
    }

    /**
     * @notice Returns the latest task number.
     * @return The latest task number as an unsigned integer.
     */
    function latestTaskNum() external view returns (uint32);

    /**
     * @notice Returns the hash of a task based on its index.
     * @param taskIndex The index of the task to query.
     * @return The hash of the specified task.
     */
    function allTaskHashes(uint32 taskIndex) external view returns (bytes32);

    /**
     * @notice Retrieves the response for a specific task from a particular operator.
     * @param operator The address of the operator who responded.
     * @param taskIndex The index of the task whose response is requested.
     * @return The response data in bytes format.
     */
    function allTaskResponses(
        address operator,
        uint32 taskIndex
    ) external view returns (bytes memory);

    /**
     * @notice Creates a new credit score task with a given name and credit score.
     * @param name The name or description of the task.
     * @return A Task struct containing the details of the created task.
     */
    function createNewTask(
        string memory name,
        string memory username,
        address userAddress
    ) external returns (Task memory);

    /**
     * @notice Allows an operator to respond to an existing credit score task.
     * @param task The Task struct with task details, including the credit score.
     * @param referenceTaskIndex The index of the task to which the response applies.
     * @param signature The operator's signature validating the task response.
     */
    function respondToTask(
        Task calldata task,
        uint32 referenceTaskIndex,
        bytes calldata signature,
        uint256 creditScore
    ) external;
}
