'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast'; // Import toast

interface WorkflowCardProps {
  workflow: {
    workflow_name: string;
    steps: any[]; // Adjust this type as per your actual step structure
    schedule_interval_str?: string; // Add this if your backend returns schedule info
  };
  onSelectWorkflow: (workflow: any) => void;
  onUpdateWorkflowName: (oldName: string, newName: string) => void;
  accessToken: string | null;
}

const WorkflowCard: React.FC<WorkflowCardProps> = ({
  workflow,
  onSelectWorkflow,
  onUpdateWorkflowName,
  accessToken,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(workflow.workflow_name);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = async () => {
    setIsEditing(false);
    if (editedName.trim() !== workflow.workflow_name) {
      if (editedName.trim() === "") {
        toast.error("Workflow name cannot be empty.");
        setEditedName(workflow.workflow_name); // Revert to old name
        return;
      }
      await onUpdateWorkflowName(workflow.workflow_name, editedName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div
      className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer flex flex-col justify-between"
      onClick={() => onSelectWorkflow(workflow)}
    >
      {isEditing ? (
        <input
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="text-lg font-semibold text-gray-800 w-full p-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      ) : (
        <h3 className="text-lg font-semibold text-gray-800 truncate" title={workflow.workflow_name} onDoubleClick={handleDoubleClick}>
          {workflow.workflow_name}
        </h3>
      )}
      <p className="text-sm text-gray-500 mt-2">
        Steps: {workflow.steps.length}
      </p>
      {workflow.schedule_interval_str && (
        <p className="text-xs text-gray-400">
          Scheduled: {workflow.schedule_interval_str}
        </p>
      )}
    </div>
  );
};

export default WorkflowCard;