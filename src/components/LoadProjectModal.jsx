import React, { useState, useEffect } from 'react';
import {
  Modal,
  Box,
  SpaceBetween,
  Button,
  Table,
  Alert,
  TextFilter,
  Pagination,
  Header,
  ButtonDropdown,
  StatusIndicator
} from '@cloudscape-design/components';
import useBuilderStore from '../store/useBuilderStore';

const LoadProjectModal = ({ visible, onDismiss }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  
  const { listProjects, loadProject, deleteProject } = useBuilderStore();

  const itemsPerPage = 10;

  // Filter projects based on search text
  const filteredProjects = projects.filter(project =>
    project.projectName.toLowerCase().includes(filterText.toLowerCase())
  );

  // Paginate filtered projects
  const paginatedProjects = filteredProjects.slice(
    (currentPageIndex - 1) * itemsPerPage,
    currentPageIndex * itemsPerPage
  );

  const loadProjectsList = async () => {
    setLoading(true);
    setError('');
    
    try {
      const result = await listProjects();
      
      if (result.success) {
        setProjects(result.projects || []);
        // Clear any previous errors when successful
        setError('');
      } else {
        // Show user-friendly error messages
        if (result.error?.includes('not configured')) {
          setError('Project storage is not set up yet. Please contact your administrator.');
        } else if (result.error?.includes('Authentication')) {
          setError('Please sign in again to access your projects.');
        } else {
          setError(result.error || 'Unable to load projects. Please try again.');
        }
      }
    } catch (err) {
      console.error('Load projects error');
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadProject = async (projectId) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await loadProject(projectId);
      
      if (result.success) {
        setSuccess('Project loaded successfully!');
        
        // Auto-close after success
        setTimeout(() => {
          setSuccess('');
          onDismiss();
        }, 1500);
      } else {
        setError(result.error || 'Failed to load project');
      }
    } catch (err) {
      console.error('Load project error');
      setError('Failed to load project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await deleteProject(projectId);
      
      if (result.success) {
        setSuccess(`Project "${projectName}" deleted successfully!`);
        // Refresh the list
        await loadProjectsList();
        setSelectedItems([]);
      } else {
        setError(result.error || 'Failed to delete project');
      }
    } catch (err) {
      console.error('Delete project error');
      setError('Failed to delete project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const handleDismiss = () => {
    if (!loading) {
      setSelectedItems([]);
      setFilterText('');
      setCurrentPageIndex(1);
      setError('');
      setSuccess('');
      onDismiss();
    }
  };

  // Load projects when modal opens
  useEffect(() => {
    if (visible) {
      loadProjectsList();
    }
  }, [visible]);

  const columnDefinitions = [
    {
      id: 'projectName',
      header: 'Project Name',
      cell: item => item.projectName,
      sortingField: 'projectName'
    },
    {
      id: 'created',
      header: 'Created',
      cell: item => formatDate(item.created),
      sortingField: 'created'
    },
    {
      id: 'modified',
      header: 'Last Modified',
      cell: item => formatDate(item.modified),
      sortingField: 'modified'
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: item => (
        <SpaceBetween direction="horizontal" size="xs">
          <Button
            size="small"
            onClick={() => handleLoadProject(item.projectId)}
            disabled={loading}
          >
            Load
          </Button>
          <ButtonDropdown
            items={[
              {
                text: 'Delete',
                id: 'delete',
                disabled: loading
              }
            ]}
            variant="icon"
            ariaLabel="More actions"
            onItemClick={() => handleDeleteProject(item.projectId, item.projectName)}
          />
        </SpaceBetween>
      )
    }
  ];

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={visible}
      closeAriaLabel="Close load project modal"
      size="large"
      header="Load Project"
      footer={
        <Box float="right">
          <Button 
            variant="link" 
            onClick={handleDismiss}
            disabled={loading}
          >
            Close
          </Button>
        </Box>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert type="success" dismissible onDismiss={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        <Table
          columnDefinitions={columnDefinitions}
          items={paginatedProjects}
          loading={loading}
          loadingText="Loading projects..."
          selectedItems={selectedItems}
          onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
          selectionType="single"
          trackBy="projectId"
          empty={
            <Box textAlign="center" color="inherit">
              <b>No projects found</b>
              <Box
                padding={{ bottom: "s" }}
                variant="p"
                color="inherit"
              >
                {error ? (
                  "Unable to load projects. Please check the error message above."
                ) : projects.length === 0 ? (
                  "You haven't saved any projects yet. Create some agents and click 'Save' to get started!"
                ) : (
                  "No projects match your search criteria."
                )}
              </Box>
            </Box>
          }
          filter={
            <TextFilter
              filteringText={filterText}
              onChange={({ detail }) => {
                setFilterText(detail.filteringText);
                setCurrentPageIndex(1); // Reset to first page when filtering
              }}
              filteringPlaceholder="Search projects..."
              countText={`${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}`}
            />
          }
          header={
            <Header
              counter={`(${projects.length})`}
              actions={
                <Button
                  iconName="refresh"
                  onClick={loadProjectsList}
                  disabled={loading}
                >
                  Refresh
                </Button>
              }
            >
              Saved Projects
            </Header>
          }
          pagination={
            filteredProjects.length > itemsPerPage ? (
              <Pagination
                currentPageIndex={currentPageIndex}
                onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
                pagesCount={Math.ceil(filteredProjects.length / itemsPerPage)}
              />
            ) : null
          }
        />

        {selectedItems.length > 0 && (
          <Box>
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="primary"
                onClick={() => handleLoadProject(selectedItems[0].projectId)}
                disabled={loading}
              >
                Load Selected Project
              </Button>
            </SpaceBetween>
          </Box>
        )}
      </SpaceBetween>
    </Modal>
  );
};

export default LoadProjectModal;