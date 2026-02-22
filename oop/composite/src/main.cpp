#include "directory.hpp"
#include "file.hpp"

int main()
{
    Directory* root = new Directory("root");

    Directory* docs = new Directory("docs");
    docs->Add(new File("readme.md"));
    docs->Add(new File("notes.txt"));

    Directory* src = new Directory("src");
    src->Add(new File("main.cpp"));
    src->Add(new File("utils.cpp"));

    Directory* app = new Directory("app");
    app->Add(new File("app.cpp"));
    app->Add(new File("app.hpp"));
    src->Add(app);

    Directory* assets = new Directory("assets");
    assets->Add(new File("logo.png"));

    root->Add(docs);
    root->Add(src);
    root->Add(assets);
    root->Add(new File(".gitignore"));

    // root.Print();

    Directory* cloned_root = dynamic_cast<Directory*>(root->clone());

    cloned_root->Print();

    IFSElement* file = cloned_root->m_contents[0]->clone();
    file->Print(); 

    delete file;
    delete cloned_root;
    delete root;

    return 0;
}
